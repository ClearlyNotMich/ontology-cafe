import { MAX_CARD_TEXT, isNamedPile, normalizeTerm, parseTermList } from "./logic";

/** Most cards one import may add, so a huge file can't flood a room. */
export const MAX_IMPORT = 300;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Terms from one of our own exports (card sorting or 20 Questions, JSON or Markdown) or a plain
 * one-term-per-line list: cards, named piles, 20Q concepts and suggested terms. Unique, file order.
 */
export function parseImport(text: string): string[] {
  const json = tryJson(text);
  const raw =
    json !== undefined
      ? termsFromJson(json)
      : /^# Ontology Café:/m.test(text)
        ? termsFromMarkdown(text)
        : parseTermList(
            text
              .split(/\r?\n/)
              .filter((l) => !l.trim().startsWith("#"))
              .join("\n"),
          );
  return dedupe(raw);
}

/** Splits parsed terms into new ones (capped) and how many the room already has. */
export function planImport(found: string[], existing: string[]) {
  const have = new Set(existing.map(normalizeTerm));
  const fresh = found.filter((t) => !have.has(normalizeTerm(t)));
  return { terms: fresh.slice(0, MAX_IMPORT), existing: found.length - fresh.length };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function termsFromJson(data: unknown): string[] {
  if (Array.isArray(data)) return data.map(str);
  if (!isObj(data)) return [];
  const cardText = (c: unknown) => (isObj(c) ? str(c.text) : str(c));
  return [
    ...arr(data.piles).flatMap((p) =>
      isObj(p)
        ? [isNamedPile({ name: str(p.name) }) ? str(p.name) : "", ...arr(p.cards).map(cardText)]
        : [],
    ),
    ...arr(data.unsorted).map(cardText),
    ...arr(data.newConcepts).map(str),
    ...arr(data.terms).map(str),
    ...arr(data.rounds).map((r) => (isObj(r) ? str(r.concept) : "")),
    ...arr(data.suggestedTerms).map((t) => (isObj(t) ? str(t.term) : str(t))),
  ];
}

// Markdown sections whose list items are terms; everything else (links, tree, paths) is skipped.
const LIST_SECTIONS = [
  "piles",
  "new concepts",
  "unsorted cards",
  "all unique terms",
  "terms suggested",
];

function termsFromMarkdown(text: string): string[] {
  const terms: string[] = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const h2 = line.match(/^## (.*)/);
    if (h2) {
      section = h2[1]!.toLowerCase();
      continue;
    }
    const h3 = line.match(/^### (.*)/);
    if (h3) {
      if (section === "piles") {
        const name = h3[1]!.replace(/ \(new concept\)$/, "");
        if (isNamedPile({ name })) terms.push(name);
      } else if (section === "rounds") {
        const concept = h3[1]!.match(/^Round \d+: (.*)/)?.[1];
        if (concept && concept !== "(not picked yet)") terms.push(concept);
      }
      continue;
    }
    const item = line.match(/^- (.*)/)?.[1];
    if (!item || !LIST_SECTIONS.some((s) => section.startsWith(s))) continue;
    terms.push(item.replace(/ _\(note: .*\)_$/, "").replace(/ \(from ".*"\)$/, ""));
  }
  return terms;
}

function dedupe(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const term = r.trim().slice(0, MAX_CARD_TEXT).trim();
    const key = normalizeTerm(term);
    // "_none_" / "_empty_" are the exports' placeholders for empty lists.
    if (!key || /^_\w+_$/.test(term) || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}
