import { describe, expect, it } from "vitest";

import { buildCardSortExport, buildTqExport } from "./export";
import {
  TQ_NOTE_PREFIX,
  beansLeft,
  computeScores,
  findDuplicateGroups,
  generateRoomCode,
  matchesConcept,
  mergeTree,
  nextBarista,
  parseTermList,
  pickPlayerColor,
  planMerge,
  suggestTag,
  termFromQuestion,
  treeToMarkdown,
  uniqueTerms,
} from "./logic";
import type { Card, Link, Pile, Player, Question, Round } from "./types";

let seq = 0;
const ts = () => new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)).toISOString();
const card = (o: Partial<Card>): Card => ({
  id: `c${seq}`,
  room_id: "r",
  author_id: null,
  co_author_ids: [],
  text: "x",
  note: "",
  pile_id: null,
  position: 0,
  created_at: ts(),
  ...o,
});
const pile = (o: Partial<Pile>): Pile => ({
  id: `p${seq}`,
  room_id: "r",
  name: "New pile",
  color: "amber",
  reason: "",
  collapsed: false,
  position: 0,
  created_at: ts(),
  ...o,
});
const player = (id: string, name: string): Player => ({
  id,
  room_id: "r",
  name,
  color: "#000",
  confirmed: false,
  created_at: ts(),
});
const round = (o: Partial<Round>): Round => ({
  id: `r${seq}`,
  room_id: "r",
  number: 1,
  barista_id: null,
  concept: null,
  status: "playing",
  winner_id: null,
  created_at: ts(),
  ended_at: null,
  ...o,
});
const q = (round_id: string, text: string, o: Partial<Question> = {}): Question => ({
  id: `q${seq}`,
  room_id: "r",
  round_id,
  asker_id: null,
  kind: "question",
  text,
  answer: null,
  correct: null,
  tag: null,
  created_at: ts(),
  ...o,
});

describe("terms and cards", () => {
  it("parses pasted lists: bullets, numbers, blanks and repeats", () => {
    expect(parseTermList("- Latte\n\n2. oat milk\n* latte \n  Espresso  ")).toEqual([
      "Latte",
      "oat milk",
      "Espresso",
    ]);
  });

  it("generates valid room codes and picks unused colours", () => {
    expect(generateRoomCode()).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(pickPlayerColor([{ color: "#b45309" }])).toBe("#be123c");
  });

  it("finds case-insensitive duplicates and merges keeping every author", () => {
    const a = card({ id: "a", text: "Oat milk", author_id: "p1", note: "plant based" });
    const b = card({
      id: "b",
      text: " oat  MILK",
      author_id: "p2",
      pile_id: "pile1",
      co_author_ids: ["p3"],
    });
    const c = card({ id: "c", text: "Latte", author_id: "p1" });
    const groups = findDuplicateGroups([c, b, a]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([["a", "b"]]);
    expect(planMerge(groups[0]!)).toEqual({
      keepId: "a",
      update: { co_author_ids: ["p2", "p3"], note: "plant based", pile_id: "pile1" },
      deleteIds: ["b"],
    });
  });

  it("collects unique terms from cards and named piles", () => {
    const terms = uniqueTerms(
      [card({ text: "latte" }), card({ text: "Latte" }), card({ text: "Arabica" })],
      [pile({ name: "Drinks" }), pile({ name: "New pile" })],
    );
    expect(terms).toEqual(["Arabica", "Drinks", "latte"]);
  });
});

describe("20 questions", () => {
  it("tags and turns questions into terms", () => {
    expect(suggestTag("Is it a drink?")).toBe("class");
    expect(suggestTag("Does it contain milk?")).toBe("property");
    expect(suggestTag("Hot?")).toBeNull();
    expect(termFromQuestion("Does it contain milk?")).toBe("milk");
    expect(termFromQuestion("Is it a kind of brewing method?")).toBe("brewing method");
  });

  it("matches guesses loosely", () => {
    expect(matchesConcept("Is it a latte?", "Latte")).toBe(true);
    expect(matchesConcept("the  LATTE", "latte")).toBe(true);
    expect(matchesConcept("cappuccino", "latte")).toBe(false);
    expect(matchesConcept("", "")).toBe(false);
  });

  it("counts beans and scores earlier guesses higher", () => {
    const r1 = round({ id: "r1", status: "guessed", winner_id: "d1", barista_id: "b" });
    const r2 = round({ id: "r2", number: 2, status: "stumped", barista_id: "b" });
    const qs = [
      q("r1", "Is it a drink?", { answer: "yes" }),
      q("r1", "espresso", { kind: "guess", correct: false }),
      q("r1", "Pending?"),
      q("r1", "latte", { kind: "guess", correct: true }),
    ];
    expect(beansLeft(qs)).toBe(18);
    expect(computeScores([r1, r2], qs)).toEqual([
      { playerId: "d1", points: 18 },
      { playerId: "b", points: 10 },
    ]);
  });

  it("rotates the Barista in join order", () => {
    const ps = [player("a", "A"), player("b", "B")];
    expect(nextBarista(ps, null)?.id).toBe("a");
    expect(nextBarista(ps, "a")?.id).toBe("b");
    expect(nextBarista(ps, "b")?.id).toBe("a");
  });

  it("merges question paths into one tree", () => {
    const r1 = round({ id: "r1", status: "guessed", concept: "Latte" });
    const r2 = round({ id: "r2", number: 2, status: "stumped", concept: "Cappuccino" });
    const r3 = round({ id: "r3", number: 3, status: "guessed", concept: "AeroPress" });
    const live = round({ id: "r4", number: 4, status: "playing", concept: "Secret" });
    const qs = [
      q("r1", "Is it a drink?", { answer: "yes", tag: "class" }),
      q("r1", "Does it contain milk?", { answer: "yes" }),
      q("r2", "is it a drink", { answer: "yes" }),
      q("r2", "Does it contain milk?", { answer: "yes", tag: "property" }),
      q("r3", "Is it a drink?", { answer: "no" }),
      q("r4", "Is it a drink?", { answer: "yes" }),
    ];
    const tree = mergeTree([r3, live, r2, r1], qs);
    expect(tree.children).toHaveLength(2);
    const drink = tree.children[0]!;
    expect(drink.questionIds).toHaveLength(2);
    expect(drink.children[0]!.concepts).toEqual(["Latte", "Cappuccino"]);
    expect(drink.children[0]!.tag).toBe("property");
    expect(treeToMarkdown(tree)).toBe(
      [
        "- Is it a drink? → yes _(class)_",
        "  - Does it contain milk? → yes _(property)_",
        "    - **Latte**",
        "    - **Cappuccino**",
        "- Is it a drink? → no",
        "  - **AeroPress**",
      ].join("\n"),
    );
  });
});

describe("exports", () => {
  const players = [player("p1", "Anna"), player("p2", "Sam")];

  it("builds the card sorting export", () => {
    const drinks = pile({ id: "drinks", name: "Drinks", reason: "you can order them" });
    const milk = pile({ id: "milk", name: "Milks", position: 1 });
    const cards = [
      card({ text: "Latte", pile_id: "drinks", author_id: "p1", co_author_ids: ["p2"] }),
      card({ text: "Oat milk", pile_id: "milk", note: "vegan" }),
      card({ text: "Arabica" }),
    ];
    const links: Link[] = [
      {
        id: "l",
        room_id: "r",
        from_pile_id: "drinks",
        to_pile_id: "milk",
        label: "has ingredient",
        reason: "lattes need milk",
        created_at: ts(),
      },
    ];
    const out = buildCardSortExport({
      roomCode: "ABCDE",
      exportedAt: "now",
      players,
      cards,
      piles: [milk, drinks],
      links,
    });
    expect(out.json).toMatchObject({
      piles: [
        { name: "Drinks", newConcept: true, cards: [{ text: "Latte", authors: ["Anna", "Sam"] }] },
        { name: "Milks", cards: [{ text: "Oat milk", note: "vegan" }] },
      ],
      newConcepts: ["Drinks", "Milks"],
      links: [{ from: "Drinks", label: "has ingredient", to: "Milks", reason: "lattes need milk" }],
      unsorted: [{ text: "Arabica" }],
      terms: ["Arabica", "Drinks", "Latte", "Milks", "Oat milk"],
    });
    expect(out.markdown).toContain("### Drinks (new concept)");
    expect(out.markdown).toContain("- Drinks **has ingredient** Milks (why: lattes need milk)");
    expect(out.markdown).toContain("- Oat milk _(note: vegan)_");
    expect(out.filename).toBe("ontology-cafe-ABCDE-card-sorting");
  });

  it("builds the 20 questions export", () => {
    const r1 = round({
      id: "r1",
      status: "guessed",
      concept: "Latte",
      barista_id: "p1",
      winner_id: "p2",
    });
    const qs = [
      q("r1", "Is it a drink?", { answer: "yes", tag: "class" }),
      q("r1", "latte", { kind: "guess", correct: true }),
    ];
    const cards = [card({ text: "drink", note: `${TQ_NOTE_PREFIX} Is it a drink?` })];
    const out = buildTqExport({
      roomCode: "ABCDE",
      exportedAt: "now",
      players,
      rounds: [r1],
      questions: qs,
      cards,
    });
    expect(out.markdown).toContain("### Round 1: Latte");
    expect(out.markdown).toContain("Barista: Anna. Result: guessed by Sam.");
    expect(out.markdown).toContain("1. Is it a drink? → yes [class]");
    expect(out.markdown).toContain('2. Guess: "latte" (correct)');
    expect(out.markdown).toContain("- Is it a drink? → yes _(class)_\n  - **Latte**");
    expect(out.markdown).toContain('- drink (from "Is it a drink?")');
    expect(out.markdown).toContain("- Round 1: Is it a drink? yes → Latte");
    expect(out.json).toMatchObject({
      suggestedTerms: [{ term: "drink", fromQuestion: "Is it a drink?" }],
    });
  });
});
