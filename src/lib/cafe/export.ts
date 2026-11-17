import {
  ANSWER_LABELS,
  TQ_NOTE_PREFIX,
  isNamedPile,
  mergeTree,
  roundPath,
  treeToMarkdown,
  uniqueTerms,
} from "./logic";
import type { Card, Link, Pile, Player, Question, Round } from "./types";

export type ExportFile = { markdown: string; json: unknown; filename: string };

type CardSortInput = {
  roomCode: string;
  exportedAt: string;
  players: Player[];
  cards: Card[];
  piles: Pile[];
  links: Link[];
};

export function buildCardSortExport({
  roomCode,
  exportedAt,
  players,
  cards,
  piles,
  links,
}: CardSortInput): ExportFile {
  const name = (id: string | null) => players.find((p) => p.id === id)?.name ?? "unknown";
  const cardJson = (c: Card) => ({
    text: c.text,
    note: c.note || undefined,
    authors: [c.author_id, ...c.co_author_ids].filter(Boolean).map(name),
  });
  const sortedPiles = [...piles].sort((a, b) => a.position - b.position);
  const pileCards = (pileId: string | null) =>
    cards.filter((c) => c.pile_id === pileId).sort((a, b) => a.position - b.position);
  const pileName = (id: string) => piles.find((p) => p.id === id)?.name ?? "?";

  const json = {
    room: roomCode,
    exportedAt,
    piles: sortedPiles.map((p) => ({
      name: p.name,
      newConcept: isNamedPile(p),
      reason: p.reason || undefined,
      cards: pileCards(p.id).map(cardJson),
    })),
    newConcepts: sortedPiles.filter(isNamedPile).map((p) => p.name),
    links: links.map((l) => ({
      from: pileName(l.from_pile_id),
      label: l.label,
      to: pileName(l.to_pile_id),
      reason: l.reason || undefined,
    })),
    unsorted: pileCards(null).map(cardJson),
    terms: uniqueTerms(cards, piles),
  };

  const cardLine = (c: ReturnType<typeof cardJson>) =>
    `- ${c.text}${c.note ? ` _(note: ${c.note.replace(/\n/g, "; ")})_` : ""}`;
  const md = [
    `# Ontology Café: card sorting (room ${roomCode})`,
    "",
    `_Exported ${exportedAt}_`,
    "",
  ];
  md.push("## Piles", "");
  if (!json.piles.length) md.push("_No piles yet._", "");
  for (const p of json.piles) {
    md.push(`### ${p.name}${p.newConcept ? " (new concept)" : ""}`, "");
    if (p.reason) md.push(`> Why: ${p.reason}`, "");
    md.push(...(p.cards.length ? p.cards.map(cardLine) : ["_empty_"]), "");
  }
  md.push("## New concepts (pile names)", "", ...listOrNone(json.newConcepts), "");
  md.push("## Links", "");
  md.push(
    ...(json.links.length
      ? json.links.map(
          (l) => `- ${l.from} **${l.label}** ${l.to}${l.reason ? ` (why: ${l.reason})` : ""}`,
        )
      : ["_none_"]),
    "",
  );
  md.push(
    "## Unsorted cards",
    "",
    ...(json.unsorted.length ? json.unsorted.map(cardLine) : ["_none_"]),
    "",
  );
  md.push(`## All unique terms (${json.terms.length})`, "", ...listOrNone(json.terms), "");

  return { markdown: md.join("\n"), json, filename: `ontology-cafe-${roomCode}-card-sorting` };
}

type TqInput = {
  roomCode: string;
  exportedAt: string;
  players: Player[];
  rounds: Round[];
  questions: Question[];
  cards: Card[];
};

export function buildTqExport({
  roomCode,
  exportedAt,
  players,
  rounds,
  questions,
  cards,
}: TqInput): ExportFile {
  const name = (id: string | null) => players.find((p) => p.id === id)?.name ?? null;
  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  const tree = mergeTree(ordered, questions);
  const suggestedTerms = cards
    .filter((c) => c.note.startsWith(TQ_NOTE_PREFIX))
    .map((c) => ({ term: c.text, fromQuestion: c.note.slice(TQ_NOTE_PREFIX.length).trim() }));

  const json = {
    room: roomCode,
    exportedAt,
    rounds: ordered.map((r) => ({
      number: r.number,
      barista: name(r.barista_id),
      concept: r.concept,
      status: r.status,
      winner: name(r.winner_id),
      questions: questions
        .filter((q) => q.round_id === r.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((q) => ({
          kind: q.kind,
          text: q.text,
          answer: q.answer,
          correct: q.correct,
          tag: q.tag,
          asker: name(q.asker_id),
        })),
    })),
    tree,
    suggestedTerms,
  };

  const md = [
    `# Ontology Café: 20 Questions (room ${roomCode})`,
    "",
    `_Exported ${exportedAt}_`,
    "",
  ];
  md.push("## Rounds", "");
  if (!json.rounds.length) md.push("_No rounds yet._", "");
  for (const r of json.rounds) {
    const result =
      r.status === "guessed"
        ? `guessed by ${r.winner ?? "?"}`
        : r.status === "stumped"
          ? "nobody guessed it"
          : r.status;
    md.push(`### Round ${r.number}: ${r.concept ?? "(not picked yet)"}`, "");
    md.push(`Barista: ${r.barista ?? "?"}. Result: ${result}.`, "");
    r.questions.forEach((q, i) => {
      if (q.kind === "guess") {
        md.push(`${i + 1}. Guess: "${q.text}" (${q.correct ? "correct" : "wrong"})`);
      } else {
        const answer = q.answer ? (ANSWER_LABELS[q.answer] ?? q.answer) : "unanswered";
        md.push(`${i + 1}. ${q.text} → ${answer}${q.tag ? ` [${q.tag}]` : ""}`);
      }
    });
    md.push("");
  }
  md.push("## Merged decision tree", "", treeToMarkdown(tree) || "_empty_", "");
  md.push(
    "## Terms suggested from questions",
    "",
    ...(suggestedTerms.length
      ? suggestedTerms.map((t) => `- ${t.term} (from "${t.fromQuestion}")`)
      : ["_none_"]),
    "",
  );
  // Paths per round, the actual point: the order of questions reveals the taxonomy.
  const paths = ordered
    .filter((r) => r.concept)
    .map(
      (r) =>
        `- Round ${r.number}: ${[...roundPath(r, questions).map((s) => `${s.question} ${s.answer}`), r.concept].join(" → ")}`,
    );
  md.push("## Question paths", "", ...(paths.length ? paths : ["_none_"]), "");

  return { markdown: md.join("\n"), json, filename: `ontology-cafe-${roomCode}-20-questions` };
}

function listOrNone(items: string[]): string[] {
  return items.length ? items.map((t) => `- ${t}`) : ["_none_"];
}
