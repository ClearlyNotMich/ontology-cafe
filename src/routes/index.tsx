import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Coffee, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getSavedName, savePlayerId, saveName, uuid } from "@/lib/cafe/identity";
import { PLAYER_COLORS, generateRoomCode } from "@/lib/cafe/logic";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ontology Café" },
      { name: "description", content: "Card sorting & 20 questions for our coffee ontology" },
      { property: "og:title", content: "Ontology Café" },
      {
        property: "og:description",
        content: "Card sorting & 20 questions for our coffee ontology",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

async function createRoom(name: string): Promise<string> {
  const playerId = uuid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ code, host_id: playerId })
      .select()
      .single();
    if (error?.code === "23505") continue; // code already taken
    if (error || !room) throw error ?? new Error("No room returned");
    const { error: playerError } = await supabase
      .from("players")
      .insert({ id: playerId, room_id: room.id, name, color: PLAYER_COLORS[0]! });
    if (playerError) throw playerError;
    savePlayerId(room.id, playerId);
    return code;
  }
  throw new Error("Couldn't find a free room code");
}

function Index() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Buttons stay disabled until hydrated; before that a submit would be a plain page reload.
  const [hydrated, setHydrated] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Keep anything typed before hydration instead of wiping it.
    setName(nameRef.current?.value || getSavedName());
    setHydrated(true);
  }, []);

  const create = async () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) {
      toast.error("Pick a display name first");
      return;
    }
    setBusy(true);
    try {
      saveName(trimmed);
      const roomCode = await createRoom(trimmed);
      await navigate({ to: "/room/$code", params: { code: roomCode } });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't create the room. Try again?");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="space-y-3">
        <Coffee className="mx-auto size-14 text-primary" />
        <h1 className="text-5xl font-semibold tracking-tight">Ontology Café</h1>
        <p className="text-lg text-muted-foreground">
          Card sorting &amp; 20 questions for our coffee ontology
        </p>
      </div>
      <form
        className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          ref={nameRef}
          aria-label="Your display name"
          placeholder="Your display name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="h-11 text-base"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full text-base"
          disabled={busy || !hydrated}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Coffee />} Create room
        </Button>
      </form>
      <form
        className="flex w-full max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c) void navigate({ to: "/room/$code", params: { code: c } });
        }}
      >
        <Input
          aria-label="Room code"
          placeholder="Got a code? e.g. K7QF2"
          value={code}
          maxLength={8}
          onChange={(e) => setCode(e.target.value)}
          className="h-11 text-base uppercase"
        />
        <Button type="submit" variant="outline" className="h-11" disabled={!hydrated}>
          Join
        </Button>
      </form>
    </main>
  );
}
