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
    expect(parseTermList("- Shark\n\n2. pet fish\n* shark \n  Goldfish  ")).toEqual([
      "Shark",
      "pet fish",
      "Goldfish",
    ]);
  });

  it("generates valid room codes and picks unused colours", () => {
    expect(generateRoomCode()).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(pickPlayerColor([{ color: "#b45309" }])).toBe("#be123c");
  });

  it("finds case-insensitive duplicates and merges keeping every author", () => {
    const a = card({ id: "a", text: "Pet fish", author_id: "p1", note: "kept at home" });
    const b = card({
      id: "b",
      text: " pet  FISH",
      author_id: "p2",
      pile_id: "pile1",
      co_author_ids: ["p3"],
    });
    const c = card({ id: "c", text: "Shark", author_id: "p1" });
    const groups = findDuplicateGroups([c, b, a]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([["a", "b"]]);
    expect(planMerge(groups[0]!)).toEqual({
      keepId: "a",
      update: { co_author_ids: ["p2", "p3"], note: "kept at home", pile_id: "pile1" },
      deleteIds: ["b"],
    });
  });

  it("collects unique terms from cards and named piles", () => {
    const terms = uniqueTerms(
      [card({ text: "shark" }), card({ text: "Shark" }), card({ text: "Animal" })],
      [pile({ name: "Fish" }), pile({ name: "New pile" })],
    );
    expect(terms).toEqual(["Animal", "Fish", "shark"]);
  });
});

describe("20 questions", () => {
  it("tags and turns questions into terms", () => {
    expect(suggestTag("Is it a fish?")).toBe("class");
    expect(suggestTag("Does it have fins?")).toBe("property");
    expect(suggestTag("Hot?")).toBeNull();
    expect(termFromQuestion("Does it have fins?")).toBe("fins");
    expect(termFromQuestion("Is it a kind of farm animal?")).toBe("farm animal");
  });

  it("matches guesses loosely", () => {
    expect(matchesConcept("Is it a shark?", "Shark")).toBe(true);
    expect(matchesConcept("the  SHARK", "shark")).toBe(true);
    expect(matchesConcept("goldfish", "shark")).toBe(false);
    expect(matchesConcept("", "")).toBe(false);
  });

  it("counts beans and scores earlier guesses higher", () => {
    const r1 = round({ id: "r1", status: "guessed", winner_id: "d1", barista_id: "b" });
    const r2 = round({ id: "r2", number: 2, status: "stumped", barista_id: "b" });
    const qs = [
      q("r1", "Is it a fish?", { answer: "yes" }),
      q("r1", "goldfish", { kind: "guess", correct: false }),
      q("r1", "Pending?"),
      q("r1", "shark", { kind: "guess", correct: true }),
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
    const r1 = round({ id: "r1", status: "guessed", concept: "Shark" });
    const r2 = round({ id: "r2", number: 2, status: "stumped", concept: "Goldfish" });
    const r3 = round({ id: "r3", number: 3, status: "guessed", concept: "Cat" });
    const live = round({ id: "r4", number: 4, status: "playing", concept: "Secret" });
    const qs = [
      q("r1", "Is it a fish?", { answer: "yes", tag: "class" }),
      q("r1", "Does it have fins?", { answer: "yes" }),
      q("r2", "is it a fish", { answer: "yes" }),
      q("r2", "Does it have fins?", { answer: "yes", tag: "property" }),
      q("r3", "Is it a fish?", { answer: "no" }),
      q("r4", "Is it a fish?", { answer: "yes" }),
    ];
    const tree = mergeTree([r3, live, r2, r1], qs);
    expect(tree.children).toHaveLength(2);
    const fish = tree.children[0]!;
    expect(fish.questionIds).toHaveLength(2);
    expect(fish.children[0]!.concepts).toEqual(["Shark", "Goldfish"]);
    expect(fish.children[0]!.tag).toBe("property");
    expect(treeToMarkdown(tree)).toBe(
      [
        "- Is it a fish? → yes _(class)_",
        "  - Does it have fins? → yes _(property)_",
        "    - **Shark**",
        "    - **Goldfish**",
        "- Is it a fish? → no",
        "  - **Cat**",
      ].join("\n"),
    );
  });
});

describe("exports", () => {
  const players = [player("p1", "Anna"), player("p2", "Sam")];

  it("builds the card sorting export", () => {
    const fish = pile({ id: "fish", name: "Fish", reason: "they live in water" });
    const pets = pile({ id: "pets", name: "Pets", position: 1 });
    const cards = [
      card({ text: "Shark", pile_id: "fish", author_id: "p1", co_author_ids: ["p2"] }),
      card({ text: "Goldfish", pile_id: "pets", note: "kept in a bowl" }),
      card({ text: "Animal" }),
    ];
    const links: Link[] = [
      {
        id: "l",
        room_id: "r",
        from_pile_id: "fish",
        to_pile_id: "pets",
        label: "related to",
        reason: "some fish are pets",
        created_at: ts(),
      },
    ];
    const out = buildCardSortExport({
      roomCode: "ABCDE",
      exportedAt: "now",
      players,
      cards,
      piles: [pets, fish],
      links,
    });
    expect(out.json).toMatchObject({
      piles: [
        { name: "Fish", newConcept: true, cards: [{ text: "Shark", authors: ["Anna", "Sam"] }] },
        { name: "Pets", cards: [{ text: "Goldfish", note: "kept in a bowl" }] },
      ],
      newConcepts: ["Fish", "Pets"],
      links: [{ from: "Fish", label: "related to", to: "Pets", reason: "some fish are pets" }],
      unsorted: [{ text: "Animal" }],
      terms: ["Animal", "Fish", "Goldfish", "Pets", "Shark"],
    });
    expect(out.markdown).toContain("### Fish (new concept)");
    expect(out.markdown).toContain("- Fish **related to** Pets (why: some fish are pets)");
    expect(out.markdown).toContain("- Goldfish _(note: kept in a bowl)_");
    expect(out.filename).toBe("ontology-cafe-ABCDE-card-sorting");
  });

  it("builds the 20 questions export", () => {
    const r1 = round({
      id: "r1",
      status: "guessed",
      concept: "Shark",
      barista_id: "p1",
      winner_id: "p2",
    });
    const qs = [
      q("r1", "Is it a fish?", { answer: "yes", tag: "class" }),
      q("r1", "shark", { kind: "guess", correct: true }),
    ];
    const cards = [card({ text: "fish", note: `${TQ_NOTE_PREFIX} Is it a fish?` })];
    const out = buildTqExport({
      roomCode: "ABCDE",
      exportedAt: "now",
      players,
      rounds: [r1],
      questions: qs,
      cards,
    });
    expect(out.markdown).toContain("### Round 1: Shark");
    expect(out.markdown).toContain("Barista: Anna. Result: guessed by Sam.");
    expect(out.markdown).toContain("1. Is it a fish? → yes [class]");
    expect(out.markdown).toContain('2. Guess: "shark" (correct)');
    expect(out.markdown).toContain("- Is it a fish? → yes _(class)_\n  - **Shark**");
    expect(out.markdown).toContain('- fish (from "Is it a fish?")');
    expect(out.markdown).toContain("- Round 1: Is it a fish? yes → Shark");
    expect(out.json).toMatchObject({
      suggestedTerms: [{ term: "fish", fromQuestion: "Is it a fish?" }],
    });
  });
});
