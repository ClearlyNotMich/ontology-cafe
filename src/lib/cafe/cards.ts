import { supabase } from "@/integrations/supabase/client";
import { uuid } from "./identity";
import { MAX_CARD_TEXT } from "./logic";
import type { Cafe } from "./room-store";
import type { Card } from "./types";

/** Optimistically add cards, then persist. Shared by the write phase, the sort board and 20Q. */
export function addCards(
  cafe: Cafe,
  terms: string[],
  extra: Partial<Pick<Card, "note" | "pile_id">> = {},
) {
  const base = Math.max(0, ...cafe.cards.map((c) => c.position));
  const rows: Card[] = terms.map((text, i) => ({
    id: uuid(),
    room_id: cafe.room.id,
    author_id: cafe.me.id,
    co_author_ids: [],
    text: text.trim().slice(0, MAX_CARD_TEXT),
    note: extra.note ?? "",
    pile_id: extra.pile_id ?? null,
    position: base + i + 1,
    created_at: new Date().toISOString(),
  }));
  rows.forEach((r) => cafe.upsertLocal("cards", r));
  return cafe.write(supabase.from("cards").insert(rows));
}
