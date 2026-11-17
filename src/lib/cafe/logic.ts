import type { Card, Pile, Player, Question, Round, Tag } from "./types";

export const TOTAL_BEANS = 20;
// Match the rooms.topic / rooms.scope check constraints.
export const MAX_TOPIC = 120;
export const MAX_SCOPE = 4000;
export const STUMP_POINTS = 10;
export const MAX_CARD_TEXT = 120;
/** Cards created from a 20 Questions question carry this note prefix, so exports can find them. */
export const TQ_NOTE_PREFIX = "From 20 Questions:";

export const PLAYER_COLORS = [
  "#b45309",
  "#be123c",
  "#047857",
  "#0369a1",
  "#7c3aed",
  "#c2410c",
  "#4d7c0f",
  "#a21caf",
];

export function normalizeTerm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function generateRoomCode(random: () => number = Math.random, length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return code;
}

export function pickPlayerColor(players: Pick<Player, "color">[]): string {
  const used = new Set(players.map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[players.length % 8]!;
}

/** One term per line; strips list bullets/numbers and drops blank and repeated lines. */
export function parseTermList(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const term = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
      .trim()
      .slice(0, MAX_CARD_TEXT);
    const key = normalizeTerm(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/** Groups of cards (oldest first) whose text is equal ignoring case and spacing. */
export function findDuplicateGroups(cards: Card[]): Card[][] {
  const groups = new Map<string, Card[]>();
  for (const card of [...cards].sort(byCreated)) {
    const key = normalizeTerm(card.text);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export function planMerge(group: Card[]) {
  const [keep, ...rest] = [...group].sort(byCreated);
  if (!keep) throw new Error("planMerge needs at least one card");
  const authors = new Set<string>(keep.co_author_ids);
  for (const card of rest) {
    if (card.author_id) authors.add(card.author_id);
    card.co_author_ids.forEach((id) => authors.add(id));
  }
  if (keep.author_id) authors.delete(keep.author_id);
  const notes = [...new Set(group.map((c) => c.note.trim()).filter(Boolean))];
  return {
    keepId: keep.id,
    update: {
      co_author_ids: [...authors],
      note: notes.join("\n").slice(0, 500),
      pile_id: keep.pile_id ?? rest.find((c) => c.pile_id)?.pile_id ?? null,
    },
    deleteIds: rest.map((c) => c.id),
  };
}

export function isNamedPile(pile: Pick<Pile, "name">): boolean {
  const name = normalizeTerm(pile.name);
  return name !== "" && name !== "new pile";
}

/** Every card text plus every named pile, deduplicated case-insensitively, sorted A-Z. */
export function uniqueTerms(cards: Pick<Card, "text">[], piles: Pick<Pile, "name">[]): string[] {
  const terms = new Map<string, string>();
  for (const text of [
    ...cards.map((c) => c.text),
    ...piles.filter(isNamedPile).map((p) => p.name),
  ]) {
    const key = normalizeTerm(text);
    if (key && !terms.has(key)) terms.set(key, text.trim());
  }
  return [...terms.values()].sort((a, b) => a.localeCompare(b));
}

export function suggestTag(question: string): Tag | null {
  const q = normalizeTerm(question);
  if (/^(is|are) (it|they|this|that) (a|an|some|one of|kind of|type of|sort of)\b/.test(q)) {
    return "class";
  }
  if (/^(does|do|has|have|can|could|is|are|was|will)\b/.test(q)) return "property";
  return null;
}

/** "Does it have fins?" -> "fins", "Is it a fish?" -> "fish". */
export function termFromQuestion(question: string): string {
  return question
    .trim()
    .replace(/[?.!]+$/, "")
    .replace(/^(is|are|does|do|has|have|can|could|was|will)\s+(it|they|this|that)\s+/i, "")
    .replace(/^(a|an|the|some)\s+/i, "")
    .replace(/^(kind|type|sort) of\s+/i, "")
    .replace(/^(contain|contains|have|has|use|uses|made with|made from|come from|need)\s+/i, "")
    .replace(/^(a|an|the|some)\s+/i, "")
    .trim()
    .slice(0, MAX_CARD_TEXT);
}

function bareConcept(text: string): string {
  return normalizeTerm(text)
    .replace(/[?.!"']/g, "")
    .replace(/^(is it|it is|it's|its)\s+/, "")
    .replace(/^(a|an|the)\s+/, "")
    .trim();
}

export function matchesConcept(guess: string, concept: string): boolean {
  const g = bareConcept(guess);
  return g !== "" && g === bareConcept(concept);
}

export function beansLeft(roundQuestions: Question[]): number {
  const used = roundQuestions.filter(
    (q) =>
      (q.kind === "question" && q.answer !== null) || (q.kind === "guess" && q.correct === false),
  ).length;
  return Math.max(0, TOTAL_BEANS - used);
}

export function isRoundOver(round: Pick<Round, "status">): boolean {
  return round.status === "guessed" || round.status === "stumped";
}

/** Winner scores the beans left when they guessed (earlier = more); an unguessed concept scores the Barista. */
export function computeScores(rounds: Round[], questions: Question[]) {
  const scores = new Map<string, number>();
  const add = (id: string | null, points: number) => {
    if (id) scores.set(id, (scores.get(id) ?? 0) + points);
  };
  for (const round of rounds) {
    if (round.status === "guessed") {
      add(
        round.winner_id,
        Math.max(1, beansLeft(questions.filter((q) => q.round_id === round.id))),
      );
    } else if (round.status === "stumped") {
      add(round.barista_id, STUMP_POINTS);
    }
  }
  return [...scores.entries()]
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

/** Next player after the last Barista, in join order. */
export function nextBarista(players: Player[], lastBaristaId: string | null): Player | undefined {
  const order = [...players].sort(byCreated);
  const last = order.findIndex((p) => p.id === lastBaristaId);
  return order[(last + 1) % order.length];
}

export type PathStep = { id: string; question: string; answer: string; tag: string | null };

export function roundPath(round: Round, questions: Question[]): PathStep[] {
  return questions
    .filter((q) => q.round_id === round.id && q.kind === "question" && q.answer !== null)
    .sort(byCreated)
    .map((q) => ({ id: q.id, question: q.text, answer: q.answer!, tag: q.tag }));
}

export type TreeNode = {
  key: string;
  question: string;
  answer: string;
  tag: string | null;
  questionIds: string[];
  children: TreeNode[];
  concepts: string[];
};

export type Tree = { children: TreeNode[]; concepts: string[] };

/** Merge every finished round's question path into one decision tree (a trie on question + answer). */
export function mergeTree(rounds: Round[], questions: Question[]): Tree {
  const root: Tree = { children: [], concepts: [] };
  for (const round of [...rounds].sort((a, b) => a.number - b.number)) {
    if (!isRoundOver(round) || !round.concept) continue;
    let node: Tree = root;
    for (const step of roundPath(round, questions)) {
      const key = `${normalizeTerm(step.question).replace(/[?]+$/, "")}|${step.answer}`;
      let child = node.children.find((c) => c.key === key);
      if (!child) {
        child = {
          key,
          question: step.question,
          answer: step.answer,
          tag: null,
          questionIds: [],
          children: [],
          concepts: [],
        };
        node.children.push(child);
      }
      child.questionIds.push(step.id);
      child.tag = child.tag ?? step.tag;
      node = child;
    }
    if (!node.concepts.some((c) => normalizeTerm(c) === normalizeTerm(round.concept!))) {
      node.concepts.push(round.concept);
    }
  }
  return root;
}

export const ANSWER_LABELS: Record<string, string> = {
  yes: "yes",
  no: "no",
  sometimes: "sometimes",
  out_of_scope: "out of scope",
};

export function treeToMarkdown(tree: Tree): string {
  const lines: string[] = tree.concepts.map((c) => `- **${c}**`);
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      const pad = "  ".repeat(depth);
      const tag = n.tag ? ` _(${n.tag})_` : "";
      lines.push(`${pad}- ${n.question} → ${ANSWER_LABELS[n.answer] ?? n.answer}${tag}`);
      n.concepts.forEach((c) => lines.push(`${pad}  - **${c}**`));
      walk(n.children, depth + 1);
    }
  };
  walk(tree.children, 0);
  return lines.join("\n");
}

function byCreated(a: { created_at: string }, b: { created_at: string }): number {
  return a.created_at.localeCompare(b.created_at);
}
