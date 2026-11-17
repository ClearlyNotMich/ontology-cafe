import { describe, expect, it } from "vitest";

import { buildCardSortExport, buildTqExport } from "./export";
import { MAX_IMPORT, parseImport, planImport } from "./import";
import { TQ_NOTE_PREFIX } from "./logic";
import type { Card, Pile, Question, Round } from "./types";

const at = "2026-01-01T00:00:00.000Z";
const card = (text: string, o: Partial<Card> = {}): Card => ({
  id: text,
  room_id: "r",
  author_id: null,
  co_author_ids: [],
  text,
  note: "",
  pile_id: null,
  position: 0,
  created_at: at,
  ...o,
});
const pile = (id: string, name: string, position = 0): Pile => ({
  id,
  room_id: "r",
  name,
  color: "amber",
  reason: "a reason",
  collapsed: false,
  position,
  created_at: at,
});
const info = { roomCode: "ABCDE", topic: "Animals", scope: "Scope line", exportedAt: at };

const sortExport = buildCardSortExport({
  ...info,
  players: [],
  cards: [
    card("Shark", { pile_id: "fish", note: "big\nteeth" }),
    card("Goldfish", { pile_id: "unnamed" }),
    card("Animal"),
    card("shark"),
  ],
  piles: [pile("fish", "Fish"), pile("unnamed", "New pile", 1)],
  links: [
    {
      id: "l",
      room_id: "r",
      from_pile_id: "fish",
      to_pile_id: "unnamed",
      label: "is a",
      reason: "",
      created_at: at,
    },
  ],
});

const round = (id: string, number: number, concept: string | null): Round => ({
  id,
  room_id: "r",
  number,
  barista_id: null,
  concept,
  status: concept ? "guessed" : "playing",
  winner_id: null,
  created_at: at,
  ended_at: null,
});
const question: Question = {
  id: "q",
  room_id: "r",
  round_id: "r1",
  asker_id: null,
  kind: "question",
  text: "Does it have fins?",
  answer: "yes",
  correct: null,
  tag: "property",
  created_at: at,
};
const tqExport = buildTqExport({
  ...info,
  players: [],
  rounds: [round("r1", 1, "Dolphin"), round("r2", 2, null)],
  questions: [question],
  cards: [card("fins", { note: `${TQ_NOTE_PREFIX} Does it have fins?` }), card("Plain card")],
});

const sorted = (terms: string[]) => [...terms].sort((a, b) => a.localeCompare(b));

describe("parseImport", () => {
  it("round-trips the card sorting export (JSON and Markdown)", () => {
    const expected = ["Animal", "Fish", "Goldfish", "Shark"];
    expect(sorted(parseImport(JSON.stringify(sortExport.json, null, 2)))).toEqual(expected);
    expect(sorted(parseImport(sortExport.markdown))).toEqual(expected);
  });

  it("round-trips the 20 questions export (JSON and Markdown)", () => {
    const expected = ["Dolphin", "fins"];
    expect(sorted(parseImport(JSON.stringify(tqExport.json)))).toEqual(expected);
    expect(sorted(parseImport(tqExport.markdown))).toEqual(expected);
  });

  it("reads a plain list, skipping headings, blanks and repeats", () => {
    expect(parseImport("# My terms\n\n- Cat\n2. Dog\ncat\n  \nBird")).toEqual([
      "Cat",
      "Dog",
      "Bird",
    ]);
  });

  it("caps term length", () => {
    expect(parseImport("x".repeat(200))[0]).toHaveLength(120);
  });
});

describe("planImport", () => {
  it("skips terms already in the room case-insensitively and caps the count", () => {
    expect(planImport(["Cat", "dog", "Bird"], ["DOG", " bird "])).toEqual({
      terms: ["Cat"],
      existing: 2,
    });
    const many = Array.from({ length: MAX_IMPORT + 5 }, (_, i) => `t${i}`);
    expect(planImport(many, []).terms).toHaveLength(MAX_IMPORT);
  });
});
