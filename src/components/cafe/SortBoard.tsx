import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Combine,
  Link2,
  Palette,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { buildCardSortExport } from "@/lib/cafe/export";
import { uuid } from "@/lib/cafe/identity";
import { MAX_CARD_TEXT, findDuplicateGroups, isNamedPile, planMerge } from "@/lib/cafe/logic";
import { useCafe, type Cafe } from "@/lib/cafe/room-store";
import type { Card, Pile } from "@/lib/cafe/types";
import { addCards } from "./CardSorting";
import { ExportMenu, HowToPlay, SectionTitle } from "./shared";

const PILE_COLORS: Record<string, string> = {
  amber: "bg-amber-50 border-amber-300",
  rose: "bg-rose-50 border-rose-300",
  emerald: "bg-emerald-50 border-emerald-300",
  sky: "bg-sky-50 border-sky-300",
  violet: "bg-violet-50 border-violet-300",
  orange: "bg-orange-50 border-orange-300",
  lime: "bg-lime-50 border-lime-300",
  stone: "bg-stone-100 border-stone-300",
};
const COLOR_DOTS: Record<string, string> = {
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  sky: "bg-sky-400",
  violet: "bg-violet-400",
  orange: "bg-orange-400",
  lime: "bg-lime-400",
  stone: "bg-stone-400",
};
const LINK_LABELS = ["is a", "has ingredient", "made with", "has flavour", "part of", "related to"];

// Prefer the innermost target under the pointer: piles sit inside the droppable board.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const specific = hits.filter((h) => h.id !== "board");
  if (specific.length) return specific;
  return hits.length ? hits : rectIntersection(args);
};

function useActions(cafe: Cafe) {
  const pileName = (id: string | null) =>
    id ? (cafe.piles.find((p) => p.id === id)?.name ?? "a pile") : "Unsorted";
  const endPosition = (pileId: string | null) =>
    Math.max(0, ...cafe.cards.filter((c) => c.pile_id === pileId).map((c) => c.position)) + 1;

  const moveCard = async (card: Card, pileId: string | null, name = pileName(pileId)) => {
    if (card.pile_id === pileId) return;
    const position = endPosition(pileId);
    cafe.upsertLocal("cards", { ...card, pile_id: pileId, position });
    if (
      await cafe.write(
        supabase.from("cards").update({ pile_id: pileId, position }).eq("id", card.id),
      )
    )
      cafe.log(`moved '${card.text}' to ${name}`);
  };

  const createPile = async (card?: Card) => {
    const used = new Set(cafe.piles.map((p) => p.color));
    const colors = Object.keys(PILE_COLORS);
    const pile: Pile = {
      id: uuid(),
      room_id: cafe.room.id,
      name: "New pile",
      color: colors.find((c) => !used.has(c)) ?? colors[cafe.piles.length % colors.length]!,
      reason: "",
      collapsed: false,
      position: Math.max(0, ...cafe.piles.map((p) => p.position)) + 1,
      created_at: new Date().toISOString(),
    };
    cafe.upsertLocal("piles", pile);
    if (card) cafe.upsertLocal("cards", { ...card, pile_id: pile.id, position: 1 });
    if (!(await cafe.write(supabase.from("piles").insert(pile)))) return;
    cafe.log("made a new pile");
    if (card) await moveCard({ ...card, pile_id: null }, pile.id, pile.name);
  };

  const updatePile = (pile: Pile, patch: Partial<Pile>, logText?: string) => {
    cafe.upsertLocal("piles", { ...pile, ...patch });
    void cafe
      .write(supabase.from("piles").update(patch).eq("id", pile.id))
      .then((ok) => ok && logText && cafe.log(logText));
  };

  const deletePile = (pile: Pile) => {
    cafe.removeLocal("piles", [pile.id]);
    cafe.removeLocal(
      "links",
      cafe.links
        .filter((l) => l.from_pile_id === pile.id || l.to_pile_id === pile.id)
        .map((l) => l.id),
    );
    cafe.cards.forEach(
      (c) => c.pile_id === pile.id && cafe.upsertLocal("cards", { ...c, pile_id: null }),
    );
    // The FK sets cards.pile_id to null and cascades links, so one delete is enough.
    void cafe
      .write(supabase.from("piles").delete().eq("id", pile.id))
      .then((ok) => ok && cafe.log(`deleted pile '${pile.name}'`));
  };

  const mergeDuplicates = async (group: Card[]) => {
    const plan = planMerge(group);
    const keep = group.find((c) => c.id === plan.keepId)!;
    cafe.upsertLocal("cards", { ...keep, ...plan.update });
    cafe.removeLocal("cards", plan.deleteIds);
    if (!(await cafe.write(supabase.from("cards").update(plan.update).eq("id", keep.id)))) return;
    await cafe.write(supabase.from("cards").delete().in("id", plan.deleteIds));
    cafe.log(`merged ${group.length} '${keep.text}' cards`);
  };

  return { moveCard, createPile, updatePile, deletePile, mergeDuplicates, pileName };
}

export function SortBoard({
  revealing,
  resetActions,
}: {
  revealing: boolean;
  resetActions: ReactNode;
}) {
  const cafe = useCafe();
  const { cards, piles, links, room, players } = cafe;
  const actions = useActions(cafe);
  const [showAuthors, setShowAuthors] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ from?: string; to?: string; open?: boolean } | null>(
    null,
  );
  const [newCard, setNewCard] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch, so swiping still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const dupGroups = new Map<string, Card[]>();
  findDuplicateGroups(cards).forEach((g) => g.forEach((c) => dupGroups.set(c.id, g)));
  const sortedPiles = [...piles].sort((a, b) => a.position - b.position);
  const inPile = (pileId: string | null) =>
    cards.filter((c) => c.pile_id === pileId).sort((a, b) => a.position - b.position);
  const flipOrder = new Map(cards.map((c, i) => [c.id, i]));
  const activeCard = cards.find((c) => c.id === activeId);
  const editing = cards.find((c) => c.id === editingId);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const card = cards.find((c) => c.id === active.id);
    if (!card || !over) return;
    if (over.id === "unsorted") void actions.moveCard(card, null);
    else if (over.id === "board" || over.id === "new-pile") void actions.createPile(card);
    else if (piles.some((p) => p.id === over.id)) void actions.moveCard(card, String(over.id));
  };

  const startLink = (pileId: string) =>
    setLinkDraft((d) =>
      d?.from && d.from !== pileId ? { ...d, to: pileId, open: true } : { from: pileId },
    );

  const chipProps = (card: Card) => ({
    card,
    showAuthors,
    duplicates: dupGroups.get(card.id),
    flipDelay: revealing ? Math.min((flipOrder.get(card.id) ?? 0) * 60, 2000) : null,
    onEdit: () => setEditingId(card.id),
    onMerge: (g: Card[]) => void actions.mergeDuplicates(g),
  });

  return (
    <section className="space-y-4">
      <SectionTitle
        actions={
          <>
            <Button size="sm" onClick={() => void actions.createPile()}>
              <Plus /> New pile
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLinkDraft({ open: true })}>
              <Link2 /> Link piles
            </Button>
            <ExportMenu
              build={() =>
                buildCardSortExport({
                  roomCode: room.code,
                  exportedAt: new Date().toISOString(),
                  players,
                  cards,
                  piles,
                  links,
                })
              }
            />
            {resetActions}
          </>
        }
      >
        Phase B: Sort (together)
      </SectionTitle>
      <HowToPlay
        lines={[
          "Drag cards into piles (long-press on phones); drop on empty board space to start a new pile.",
          "Name each pile (a new concept!) and say why its cards belong together.",
          "Link piles with a label like “is a” or “has ingredient”, and give a reason.",
        ]}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Switch checked={showAuthors} onCheckedChange={setShowAuthors} /> Show authors
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={showLines} onCheckedChange={setShowLines} /> Show link lines
        </label>
        {linkDraft?.from && !linkDraft.open && (
          <span className="rounded-full bg-accent px-3 py-1">
            Pick a second pile to link with <strong>{actions.pileName(linkDraft.from)}</strong>
            <button className="ml-2 underline" onClick={() => setLinkDraft(null)}>
              cancel
            </button>
          </span>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Tray
            id="unsorted"
            className="lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:self-start"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Unsorted</h3>
              <span className="text-sm text-muted-foreground">{inPile(null).length} cards</span>
            </div>
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCard.trim()) return;
                void addCards(cafe, [newCard]).then(
                  (ok) => ok && cafe.log(`added '${newCard.trim()}'`),
                );
                setNewCard("");
              }}
            >
              <Input
                aria-label="Add a card"
                placeholder="Add a card…"
                value={newCard}
                maxLength={MAX_CARD_TEXT}
                onChange={(e) => setNewCard(e.target.value)}
              />
              <Button type="submit" size="icon" variant="secondary" aria-label="Add card">
                <Plus />
              </Button>
            </form>
            <div className="flex max-h-72 flex-wrap content-start gap-2 overflow-y-auto lg:max-h-none lg:flex-1">
              {inPile(null).map((c) => (
                <CardChip key={c.id} {...chipProps(c)} />
              ))}
            </div>
          </Tray>

          <BoardArea boardRef={boardRef}>
            {showLines && <LinkLines containerRef={boardRef} watch={[cards, piles, links]} />}
            <div className="relative z-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedPiles.map((pile) => (
                <PileView
                  key={pile.id}
                  pile={pile}
                  cards={inPile(pile.id)}
                  linking={linkDraft?.from === pile.id}
                  onLink={() => startLink(pile.id)}
                  actions={actions}
                  renderCard={(c) => <CardChip key={c.id} {...chipProps(c)} />}
                />
              ))}
              <NewPileTile onClick={() => void actions.createPile()} />
            </div>
          </BoardArea>
        </div>
        <DragOverlay>
          {activeCard && <CardFace card={activeCard} showAuthors={showAuthors} lifted />}
        </DragOverlay>
      </DndContext>

      <LinksList
        onDelete={(id) => {
          cafe.removeLocal("links", [id]);
          void cafe.write(supabase.from("links").delete().eq("id", id));
        }}
        pileName={actions.pileName}
      />
      <ActivityLog />

      {editing && <CardDialog card={editing} onClose={() => setEditingId(null)} />}
      {linkDraft?.open && (
        <LinkDialog
          initial={linkDraft}
          onClose={() => setLinkDraft(null)}
          pileName={actions.pileName}
        />
      )}
    </section>
  );
}

function Tray({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={`tray-${id}`}
      className={`flex flex-col gap-3 rounded-xl border-2 bg-card p-3 transition-colors ${isOver ? "border-primary bg-accent/40" : "border-dashed"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function BoardArea({
  boardRef,
  children,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "board" });
  return (
    <div
      ref={(n) => {
        setNodeRef(n);
        boardRef.current = n;
      }}
      data-testid="board"
      className={`relative min-h-80 rounded-xl border bg-[repeating-linear-gradient(45deg,transparent,transparent_12px,oklch(0.93_0.02_75/.5)_12px,oklch(0.93_0.02_75/.5)_24px)] p-3 pb-16 transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      {children}
    </div>
  );
}

function NewPileTile({ onClick }: { onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "new-pile" });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-muted-foreground transition-colors ${isOver ? "border-primary bg-accent/50 text-foreground" : ""}`}
    >
      <Plus className="size-6" />
      <span className="text-sm">Drop a card here (or click) for a new pile</span>
    </button>
  );
}

type Actions = ReturnType<typeof useActions>;

function PileView({
  pile,
  cards,
  linking,
  onLink,
  actions,
  renderCard,
}: {
  pile: Pile;
  cards: Card[];
  linking: boolean;
  onLink: () => void;
  actions: Actions;
  renderCard: (c: Card) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: pile.id });
  const [name, setName] = useState(pile.name);
  const [reason, setReason] = useState(pile.reason);
  const [prev, setPrev] = useState(pile);
  // Take remote edits unless we're the one typing (inputs only commit on blur).
  if (prev.name !== pile.name || prev.reason !== pile.reason) {
    setPrev(pile);
    if (document.activeElement?.getAttribute("data-pile-field") !== `${pile.id}-name`)
      setName(pile.name);
    if (document.activeElement?.getAttribute("data-pile-field") !== `${pile.id}-reason`)
      setReason(pile.reason);
  }
  const named = isNamedPile(pile);

  return (
    <div
      ref={setNodeRef}
      data-pile-id={pile.id}
      data-testid="pile"
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 shadow-sm transition-shadow ${PILE_COLORS[pile.color] ?? PILE_COLORS["amber"]} ${isOver ? "shadow-lg ring-2 ring-primary" : ""} ${linking ? "ring-2 ring-sky-500" : ""}`}
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={pile.collapsed ? "Expand pile" : "Collapse pile"}
          onClick={() => actions.updatePile(pile, { collapsed: !pile.collapsed })}
        >
          {pile.collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <Input
          aria-label="Pile name"
          data-pile-field={`${pile.id}-name`}
          value={name}
          maxLength={80}
          onFocus={(e) => !named && e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim() || "New pile";
            setName(n);
            if (n !== pile.name) actions.updatePile(pile, { name: n }, `named a pile '${n}'`);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-8 border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:bg-background"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Pile colour">
              <Palette />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="grid grid-cols-4 gap-1 p-2">
            {Object.keys(PILE_COLORS).map((c) => (
              <DropdownMenuItem
                key={c}
                onSelect={() => actions.updatePile(pile, { color: c })}
                aria-label={c}
              >
                <span className={`size-5 rounded-full ${COLOR_DOTS[c]}`} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={linking ? "default" : "ghost"}
          size="icon"
          className="size-7"
          aria-label="Link this pile"
          onClick={onLink}
        >
          <Link2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Delete pile"
          onClick={() => actions.deletePile(pile)}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {named && <Badge className="bg-primary/85">new concept</Badge>}
        <span>
          {cards.length} card{cards.length === 1 ? "" : "s"}
        </span>
      </div>
      {!pile.collapsed && (
        <>
          <div className="flex min-h-14 flex-wrap content-start gap-2">
            {cards.map(renderCard)}
            {!cards.length && (
              <p className="text-sm text-muted-foreground italic">Drop cards here</p>
            )}
          </div>
          <Textarea
            aria-label="Why these belong together"
            data-pile-field={`${pile.id}-reason`}
            placeholder="Why do these belong together?"
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => reason !== pile.reason && actions.updatePile(pile, { reason })}
            className="min-h-0 bg-background/70 text-sm"
          />
        </>
      )}
    </div>
  );
}

type ChipProps = {
  card: Card;
  showAuthors: boolean;
  duplicates: Card[] | undefined;
  flipDelay: number | null;
  onEdit: () => void;
  onMerge: (group: Card[]) => void;
};

function CardChip({ card, showAuthors, duplicates, flipDelay, onEdit, onMerge }: ChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onEdit}
      data-testid="card"
      className={`${isDragging ? "opacity-30" : ""} ${flipDelay !== null ? "animate-card-flip" : ""}`}
      style={flipDelay !== null ? { animationDelay: `${flipDelay}ms` } : undefined}
    >
      <CardFace
        card={card}
        showAuthors={showAuthors}
        extra={
          duplicates && (
            <span className="flex items-center gap-1">
              <Badge variant="outline" className="border-amber-500 bg-amber-100 text-amber-900">
                duplicate
              </Badge>
              <button
                className="rounded p-0.5 hover:bg-accent"
                aria-label={`Merge duplicates of ${card.text}`}
                title="Merge duplicates"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onMerge(duplicates);
                }}
              >
                <Combine className="size-4" />
              </button>
            </span>
          )
        }
      />
    </div>
  );
}

function CardFace({
  card,
  showAuthors,
  extra,
  lifted,
}: {
  card: Card;
  showAuthors: boolean;
  extra?: ReactNode;
  lifted?: boolean;
}) {
  const { players } = useCafe();
  const author = players.find((p) => p.id === card.author_id);
  const names = [card.author_id, ...card.co_author_ids]
    .map((id) => players.find((p) => p.id === id)?.name)
    .filter(Boolean);
  return (
    <div
      className={`flex cursor-grab touch-manipulation flex-col gap-0.5 rounded-lg border border-l-[5px] bg-card px-3 py-2 select-none ${lifted ? "rotate-2 cursor-grabbing shadow-xl" : "shadow-sm hover:shadow-md"}`}
      style={{ borderLeftColor: author?.color ?? "#a8a29e" }}
    >
      <span className="flex items-center gap-2 text-base leading-tight font-medium">
        {card.text}
        {card.note && (
          <StickyNote className="size-3.5 text-muted-foreground" aria-label="has note" />
        )}
      </span>
      {extra}
      {showAuthors && names.length > 0 && (
        <span className="text-xs text-muted-foreground">{names.join(", ")}</span>
      )}
    </div>
  );
}

function CardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const cafe = useCafe();
  const [text, setText] = useState(card.text);
  const [note, setNote] = useState(card.note);
  const authors = [card.author_id, ...card.co_author_ids].map(cafe.playerName);
  const save = () => {
    const t = text.trim();
    if (!t) return;
    if (t !== card.text || note !== card.note) {
      cafe.upsertLocal("cards", { ...card, text: t, note });
      void cafe
        .write(supabase.from("cards").update({ text: t, note }).eq("id", card.id))
        .then((ok) => ok && t !== card.text && cafe.log(`renamed '${card.text}' to '${t}'`));
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
          <DialogDescription>Written by {authors.join(", ")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="card-text">Text</Label>
            <Input
              id="card-text"
              value={text}
              maxLength={MAX_CARD_TEXT}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="card-note">Note</Label>
            <Textarea
              id="card-note"
              placeholder="e.g. only if made with plant milk"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              cafe.removeLocal("cards", [card.id]);
              void cafe
                .write(supabase.from("cards").delete().eq("id", card.id))
                .then((ok) => ok && cafe.log(`deleted card '${card.text}'`));
              onClose();
            }}
          >
            <Trash2 /> Delete card
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({
  initial,
  onClose,
  pileName,
}: {
  initial: { from?: string; to?: string };
  onClose: () => void;
  pileName: (id: string) => string;
}) {
  const cafe = useCafe();
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [label, setLabel] = useState("is a");
  const [reason, setReason] = useState("");
  const piles = [...cafe.piles].sort((a, b) => a.position - b.position);
  const valid = from && to && from !== to && label.trim();
  const save = () => {
    if (!valid) return;
    const link = {
      id: uuid(),
      room_id: cafe.room.id,
      from_pile_id: from,
      to_pile_id: to,
      label: label.trim().slice(0, 80),
      reason: reason.trim(),
      created_at: new Date().toISOString(),
    };
    cafe.upsertLocal("links", link);
    void cafe
      .write(supabase.from("links").insert(link))
      .then((ok) => ok && cafe.log(`linked ${pileName(from)} ${link.label} ${pileName(to)}`));
    onClose();
  };
  const select = "h-10 w-full rounded-md border bg-background px-2 text-base";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link two piles</DialogTitle>
          <DialogDescription>Read it as a sentence: “Latte is a Milk drink”.</DialogDescription>
        </DialogHeader>
        {piles.length < 2 ? (
          <p className="text-sm">Make at least two piles first.</p>
        ) : (
          <div className="space-y-3">
            <select
              aria-label="From pile"
              className={select}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">From pile…</option>
              {piles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {LINK_LABELS.map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={label === l ? "default" : "outline"}
                  onClick={() => setLabel(l)}
                >
                  {l}
                </Button>
              ))}
            </div>
            <Input
              aria-label="Link label"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="or type your own label"
            />
            <select
              aria-label="To pile"
              className={select}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">To pile…</option>
              {piles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Textarea
              aria-label="Link reason"
              placeholder="Why are they linked?"
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        <DialogFooter>
          <Button disabled={!valid} onClick={save}>
            Add link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinksList({
  onDelete,
  pileName,
}: {
  onDelete: (id: string) => void;
  pileName: (id: string) => string;
}) {
  const { links } = useCafe();
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Links ({links.length})</h3>
      {!links.length && (
        <p className="text-sm text-muted-foreground">
          No links yet. Click the <Link2 className="inline size-4" /> on two piles to connect them.
        </p>
      )}
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.id} className="flex items-start gap-2 text-sm" data-testid="link">
            <span className="flex-1">
              <strong>{pileName(l.from_pile_id)}</strong>{" "}
              <span className="rounded bg-accent px-1.5 py-0.5">{l.label}</span>{" "}
              <strong>{pileName(l.to_pile_id)}</strong>
              {l.reason && <span className="text-muted-foreground"> because {l.reason}</span>}
            </span>
            <button
              aria-label="Delete link"
              onClick={() => onDelete(l.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityLog() {
  const { events, playerName } = useCafe();
  const recent = events.slice(-30).reverse();
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Activity</h3>
      <ul className="max-h-60 space-y-1 overflow-y-auto text-sm" aria-label="Activity log">
        {recent.map((e) => (
          <li key={e.id}>
            <span className="text-muted-foreground tabular-nums">
              {new Date(e.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>{" "}
            <strong>{playerName(e.player_id)}</strong> {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Line = { id: string; x1: number; y1: number; x2: number; y2: number; label: string };

/** Draws links as lines between pile headers, re-measured whenever the board changes size. */
function LinkLines({
  containerRef,
  watch,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  watch: unknown[];
}) {
  const { links } = useCafe();
  const [lines, setLines] = useState<Line[]>([]);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const anchor = (id: string) => {
        const r = el.querySelector(`[data-pile-id="${id}"]`)?.getBoundingClientRect();
        return r && { x: r.left - base.left + r.width / 2, y: r.top - base.top + 22 };
      };
      setLines(
        links.flatMap((l) => {
          const a = anchor(l.from_pile_id);
          const b = anchor(l.to_pile_id);
          return a && b ? [{ id: l.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, label: l.label }] : [];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll("[data-pile-id]").forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, containerRef, ...watch]);
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
      aria-hidden
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.42 0.08 50)" />
        </marker>
      </defs>
      {lines.map((l) => (
        <g key={l.id}>
          <line
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="oklch(0.42 0.08 50)"
            strokeOpacity={0.55}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            markerEnd="url(#arrow)"
          />
          <text
            x={(l.x1 + l.x2) / 2}
            y={(l.y1 + l.y2) / 2 - 6}
            textAnchor="middle"
            className="fill-foreground text-xs font-semibold"
            stroke="oklch(0.97 0.018 80)"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
