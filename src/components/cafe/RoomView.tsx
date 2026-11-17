import { Link } from "@tanstack/react-router";
import { Check, Coffee, Crown, Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerId, getSavedName, savePlayerId, saveName, uuid } from "@/lib/cafe/identity";
import { pickPlayerColor } from "@/lib/cafe/logic";
import { CafeProvider, buildCafe, useCafe, useRoomData } from "@/lib/cafe/room-store";
import type { Player, Room } from "@/lib/cafe/types";
import { CardSorting } from "./CardSorting";
import { OntologyPanel } from "./shared";
import { TwentyQuestions } from "./TwentyQuestions";

export function RoomView({ code }: { code: string }) {
  const data = useRoomData(code);
  const [meId, setMeId] = useState<string | null>(null);
  const roomId = data.room?.id;
  useEffect(() => {
    if (roomId) setMeId(getPlayerId(roomId));
  }, [roomId]);
  const me = data.rows.players.find((p) => p.id === meId);
  const { trackPresence } = data;
  useEffect(() => {
    if (me?.id) trackPresence(me.id);
  }, [me?.id, trackPresence]);

  if (data.status === "loading") {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p>Brewing room {code}…</p>
      </Centered>
    );
  }
  if (data.status !== "ready" || !data.room) {
    return (
      <Centered>
        <Coffee className="size-10 text-primary" />
        <p className="text-lg">
          {data.status === "missing"
            ? `There's no room called ${code}.`
            : "Couldn't reach the café. Check your connection and refresh."}
        </p>
        <Button asChild>
          <Link to="/">Back to the café</Link>
        </Button>
      </Centered>
    );
  }
  if (!me) {
    return (
      <JoinCard
        room={data.room}
        onJoined={(player) => {
          data.upsertLocal("players", player);
          setMeId(player.id);
        }}
      />
    );
  }
  return (
    <CafeProvider value={buildCafe(data, me)}>
      <RoomShell />
    </CafeProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

function JoinCard({ room, onJoined }: { room: Room; onJoined: (player: Player) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(getSavedName()), []);

  const join = async () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    setBusy(true);
    const { data: players } = await supabase.from("players").select("color").eq("room_id", room.id);
    const player = {
      id: uuid(),
      room_id: room.id,
      name: trimmed,
      color: pickPlayerColor(players ?? []),
    };
    const { data: row, error } = await supabase.from("players").insert(player).select().single();
    if (error || !row) {
      console.error(error);
      toast.error("Couldn't join. Try again?");
      return setBusy(false);
    }
    saveName(trimmed);
    savePlayerId(room.id, row.id);
    await supabase.from("events").insert({ room_id: room.id, player_id: row.id, text: "joined" });
    onJoined(row);
  };

  return (
    <Centered>
      <Coffee className="size-12 text-primary" />
      <h1 className="text-3xl font-semibold">Join room {room.code}</h1>
      {room.topic && <p className="text-lg text-muted-foreground">Topic: {room.topic}</p>}
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <Input
          autoFocus
          aria-label="Your display name"
          placeholder="Your display name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="h-11 text-base"
        />
        <Button type="submit" size="lg" className="h-11 text-base" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="animate-spin" />} Take a seat
        </Button>
      </form>
    </Centered>
  );
}
function RoomShell() {
  const { room } = useCafe();
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link to="/" className="flex items-center gap-2 text-2xl font-semibold">
            <Coffee className="size-7 text-primary" /> Ontology Café
          </Link>
          {room.topic && (
            <p className="text-lg text-muted-foreground" data-testid="room-topic">
              Topic: <strong className="text-foreground">{room.topic}</strong>
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => toast.success("Room link copied. Send it to your group!"))
              .catch(() => toast.error(window.location.href));
          }}
        >
          <Link2 /> Room <span className="font-mono tracking-widest">{room.code}</span>
        </Button>
      </header>
      <PlayersBar />
      <OntologyPanel />
      <Tabs defaultValue="cards" className="gap-4">
        <TabsList className="h-11 w-full sm:w-auto">
          <TabsTrigger value="cards" className="px-4 text-base">
            🃏 Card sorting
          </TabsTrigger>
          <TabsTrigger value="tq" className="px-4 text-base">
            🕵️ 20 Questions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cards">
          <CardSorting />
        </TabsContent>
        <TabsContent value="tq">
          <TwentyQuestions />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlayersBar() {
  const { players, online, room, me } = useCafe();
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Players">
      {players.map((p) => {
        const isOnline = online.has(p.id);
        return (
          <li
            key={p.id}
            className={`flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm ${isOnline ? "" : "opacity-50"}`}
            title={isOnline ? "online" : "offline"}
          >
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            <span className="font-medium">
              {p.name}
              {p.id === me.id && " (you)"}
            </span>
            {room.host_id === p.id && (
              <Crown className="size-3.5 text-amber-600" aria-label="host" />
            )}
            {room.cs_phase === "write" && p.confirmed && (
              <Check className="size-3.5 text-emerald-600" aria-label="confirmed" />
            )}
            <span
              className={`size-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-stone-300"}`}
              aria-label={isOnline ? "online" : "offline"}
            />
          </li>
        );
      })}
    </ul>
  );
}
