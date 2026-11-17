import { Check, Eye, ListPlus, Plus, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { buildCardSortExport } from "@/lib/cafe/export";
import { MAX_CARD_TEXT, parseTermList } from "@/lib/cafe/logic";
import { addCards } from "@/lib/cafe/cards";
import { useCafe } from "@/lib/cafe/room-store";
import type { Card } from "@/lib/cafe/types";
import { ConfirmButton, ExportMenu, HowToPlay, ImportCardsButton, SectionTitle } from "./shared";
import { SortBoard } from "./SortBoard";

export function CardSorting() {
  const cafe = useCafe();
  const { room, isHost } = cafe;
  // Flip the cards only when the reveal happens while we're watching.
  const prevPhase = useRef(room.cs_phase);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (prevPhase.current === "write" && room.cs_phase === "sort") {
      setRevealing(true);
      const t = setTimeout(() => setRevealing(false), 4000);
      prevPhase.current = room.cs_phase;
      return () => clearTimeout(t);
    }
    prevPhase.current = room.cs_phase;
    return undefined;
  }, [room.cs_phase]);

  const restart = async () => {
    const { cards, piles, players } = cafe;
    cafe.removeLocal(
      "cards",
      cards.map((c) => c.id),
    );
    cafe.removeLocal(
      "piles",
      piles.map((p) => p.id),
    );
    cafe.removeLocal(
      "links",
      cafe.links.map((l) => l.id),
    );
    players.forEach((p) => cafe.upsertLocal("players", { ...p, confirmed: false }));
    cafe.setRoom({ ...room, cs_phase: "write" });
    await cafe.write(supabase.from("piles").delete().eq("room_id", room.id));
    await cafe.write(supabase.from("cards").delete().eq("room_id", room.id));
    await cafe.write(supabase.from("players").update({ confirmed: false }).eq("room_id", room.id));
    await cafe.write(supabase.from("rooms").update({ cs_phase: "write" }).eq("id", room.id));
    cafe.log("restarted card sorting");
  };

  const clearPiles = async () => {
    cafe.removeLocal(
      "piles",
      cafe.piles.map((p) => p.id),
    );
    cafe.removeLocal(
      "links",
      cafe.links.map((l) => l.id),
    );
    cafe.cards.forEach((c) => c.pile_id && cafe.upsertLocal("cards", { ...c, pile_id: null }));
    await cafe.write(supabase.from("piles").delete().eq("room_id", room.id));
    cafe.log("cleared all piles");
  };

  const resetActions = isHost && (
    <>
      {room.cs_phase === "sort" && (
        <ConfirmButton
          label="Clear piles"
          title="Clear all piles?"
          description="Every pile and link is deleted and all cards go back to Unsorted."
          onConfirm={() => void clearPiles()}
        />
      )}
      <ConfirmButton
        label="Restart"
        title="Restart card sorting?"
        description="All cards, piles and links are deleted for everyone and the game goes back to writing."
        onConfirm={() => void restart()}
      />
    </>
  );

  return room.cs_phase === "write" ? (
    <WritePhase resetActions={resetActions} />
  ) : (
    <SortBoard revealing={revealing} resetActions={resetActions} />
  );
}

function WritePhase({ resetActions }: { resetActions: React.ReactNode }) {
  const cafe = useCafe();
  const { me, cards, players, room, isHost } = cafe;
  const mine = cards.filter((c) => c.author_id === me.id).sort((a, b) => a.position - b.position);
  const [text, setText] = useState("");
  const [paste, setPaste] = useState<string | null>(null);

  const allConfirmed = players.length >= 2 && players.every((p) => p.confirmed);
  const reveal = (manual: boolean) => {
    cafe.setRoom({ ...room, cs_phase: "sort" });
    // Several clients may notice "everyone confirmed" at once; the phase filter keeps it idempotent.
    void cafe.write(
      supabase.from("rooms").update({ cs_phase: "sort" }).eq("id", room.id).eq("cs_phase", "write"),
    );
    if (manual) cafe.log("revealed the cards");
  };
  useEffect(() => {
    if (allConfirmed) reveal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allConfirmed]);

  const toggleConfirm = () => {
    cafe.upsertLocal("players", { ...me, confirmed: !me.confirmed });
    void cafe.write(supabase.from("players").update({ confirmed: !me.confirmed }).eq("id", me.id));
  };

  return (
    <section className="space-y-4">
      <SectionTitle
        actions={
          <>
            <ExportMenu
              build={() =>
                buildCardSortExport({
                  roomCode: room.code,
                  topic: room.topic,
                  scope: room.scope,
                  exportedAt: new Date().toISOString(),
                  players,
                  cards: mine,
                  piles: [],
                  links: [],
                })
              }
            />
            {resetActions}
          </>
        }
      >
        Phase A: Write (private)
      </SectionTitle>
      <HowToPlay
        lines={[
          `Write terms for ${room.topic || "your ontology"}, one per card (Enter adds it). Paste a list to add many at once.`,
          "Nobody sees your cards yet, only how many you wrote.",
          "Press Confirm when you're done; cards flip open once everyone has confirmed.",
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              void addCards(cafe, [text]);
              setText("");
            }}
          >
            <Input
              aria-label="New card"
              placeholder={
                me.confirmed ? "Un-confirm to keep writing" : "e.g. Shark, Pet, has fins…"
              }
              value={text}
              maxLength={MAX_CARD_TEXT}
              disabled={me.confirmed}
              onChange={(e) => setText(e.target.value)}
              className="h-12 text-lg"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              className="size-12"
              disabled={me.confirmed}
              aria-label="Add card"
            >
              <Plus />
            </Button>
          </form>
          {paste === null ? (
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPaste("")}
                disabled={me.confirmed}
              >
                <ListPlus /> Paste a list
              </Button>
              {/* Only my own cards: others' cards are private until the reveal. */}
              <ImportCardsButton existing={mine.map((c) => c.text)} disabled={me.confirmed} />
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                aria-label="Paste terms, one per line"
                placeholder={"One term per line\nShark\nGoldfish\nPet"}
                rows={5}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const terms = parseTermList(paste);
                    if (terms.length) void addCards(cafe, terms);
                    setPaste(null);
                  }}
                >
                  Add {parseTermList(paste).length} cards
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPaste(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Your cards ({mine.length})</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((card) => (
              <MyCard key={card.id} card={card} locked={me.confirmed} />
            ))}
          </ul>
        </div>
        <aside className="space-y-3 rounded-xl border bg-card p-4">
          <Button
            size="lg"
            className="h-12 w-full text-base"
            variant={me.confirmed ? "secondary" : "default"}
            onClick={toggleConfirm}
          >
            {me.confirmed ? <Undo2 /> : <Check />}
            {me.confirmed ? "Un-confirm (keep writing)" : "Confirm, I'm done"}
          </Button>
          <ul className="space-y-1.5 text-sm" aria-label="Writing progress">
            {players.map((p) => {
              const count = cards.filter((c) => c.author_id === p.id).length;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                  <span>
                    <strong>{p.id === me.id ? "You" : p.name}</strong>: {count} card
                    {count === 1 ? "" : "s"},{" "}
                    {p.confirmed ? (
                      <span className="font-medium text-emerald-700">confirmed ✓</span>
                    ) : (
                      <span className="italic text-muted-foreground">writing…</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {isHost && (
            <Button variant="outline" className="w-full" onClick={() => reveal(true)}>
              <Eye /> Reveal now
            </Button>
          )}
        </aside>
      </div>
    </section>
  );
}

function MyCard({ card, locked }: { card: Card; locked: boolean }) {
  const cafe = useCafe();
  const [text, setText] = useState(card.text);
  useEffect(() => setText(card.text), [card.text]);
  const save = () => {
    const t = text.trim();
    if (!t || t === card.text) return setText(card.text);
    cafe.upsertLocal("cards", { ...card, text: t });
    void cafe.write(supabase.from("cards").update({ text: t }).eq("id", card.id));
  };
  return (
    <li
      className="flex items-center gap-1 rounded-lg border-l-4 bg-background py-1 pr-1 pl-2 shadow-sm"
      style={{ borderLeftColor: cafe.me.color }}
    >
      <Input
        aria-label={`Edit ${card.text}`}
        value={text}
        maxLength={MAX_CARD_TEXT}
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-9 border-none bg-transparent text-base font-medium shadow-none"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${card.text}`}
        disabled={locked}
        onClick={() => {
          cafe.removeLocal("cards", [card.id]);
          void cafe.write(supabase.from("cards").delete().eq("id", card.id));
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
