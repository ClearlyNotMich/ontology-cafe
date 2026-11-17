import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { CafeEvent, Card, Link, Pile, Player, Question, Room, Round } from "./types";

export type Rows = {
  players: Player[];
  cards: Card[];
  piles: Pile[];
  links: Link[];
  events: CafeEvent[];
  tq_rounds: Round[];
  tq_questions: Question[];
};
export type ListTable = keyof Rows;
const TABLES: ListTable[] = [
  "players",
  "cards",
  "piles",
  "links",
  "events",
  "tq_rounds",
  "tq_questions",
];
const EMPTY: Rows = {
  players: [],
  cards: [],
  piles: [],
  links: [],
  events: [],
  tq_rounds: [],
  tq_questions: [],
};
const EVENT_LIMIT = 100;

type Status = "loading" | "missing" | "error" | "ready";

/** Loads one room by code, keeps every table live via one realtime channel, and tracks presence. */
export function useRoomData(code: string) {
  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<Room | null>(null);
  const [rows, setRows] = useState<Rows>(EMPTY);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef<string | null>(null);

  const upsertLocal = useCallback(<T extends ListTable>(table: T, row: Rows[T][number]) => {
    setRows((prev) => {
      const list = prev[table] as { id: string }[];
      const i = list.findIndex((r) => r.id === row.id);
      const next =
        i === -1
          ? [...list, row].slice(table === "events" ? -EVENT_LIMIT : 0)
          : list.map((r, j) => (j === i ? { ...r, ...row } : r));
      return { ...prev, [table]: next };
    });
  }, []);

  const removeLocal = useCallback((table: ListTable, ids: string[]) => {
    setRows((prev) => ({
      ...prev,
      [table]: (prev[table] as { id: string }[]).filter((r) => !ids.includes(r.id)),
    }));
  }, []);

  const loadAll = useCallback(async (roomId: string) => {
    const results = await Promise.all(
      TABLES.map((table) => {
        const query = supabase.from(table).select("*").eq("room_id", roomId);
        return table === "events"
          ? query.order("created_at", { ascending: false }).limit(EVENT_LIMIT)
          : query.order("created_at");
      }),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    const next = { ...EMPTY };
    TABLES.forEach((table, i) => {
      (next as Record<string, unknown>)[table] = results[i]!.data ?? [];
    });
    next.events = [...next.events].reverse();
    setRows(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      const { data: found, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (cancelled) return;
      if (error) return setStatus("error");
      if (!found) return setStatus("missing");
      setRoom(found);
      try {
        await loadAll(found.id);
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;
      setStatus("ready");

      const roomId = found.id;
      channel = supabase.channel(`room:${roomId}`);
      for (const table of TABLES) {
        const filter = `room_id=eq.${roomId}`;
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, (p) =>
            upsertLocal(table, p.new as Rows[typeof table][number]),
          )
          .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, (p) =>
            upsertLocal(table, p.new as Rows[typeof table][number]),
          )
          // DELETE can't be filtered and, with RLS on, may carry only the id: ids are UUIDs, so
          // removing an id we don't hold is a harmless no-op.
          .on("postgres_changes", { event: "DELETE", schema: "public", table }, (p) => {
            const old = p.old as { id?: string; room_id?: string };
            if (old.id && (!old.room_id || old.room_id === roomId)) removeLocal(table, [old.id]);
          });
      }
      channel
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
          (p) => setRoom(p.new as Room),
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ player_id: string }>();
          setOnline(new Set(Object.values(state).flatMap((m) => m.map((x) => x.player_id))));
        })
        .subscribe((s) => {
          if (s !== "SUBSCRIBED") return;
          if (meRef.current) void channel!.track({ player_id: meRef.current });
          // Catch up on anything missed while (re)connecting.
          loadAll(roomId).catch(() => {});
        });
      channelRef.current = channel;
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code, loadAll, upsertLocal, removeLocal]);

  const trackPresence = useCallback((playerId: string) => {
    meRef.current = playerId;
    void channelRef.current?.track({ player_id: playerId });
  }, []);

  const reload = useCallback(() => {
    if (room) loadAll(room.id).catch(() => {});
  }, [room, loadAll]);

  return {
    status,
    room,
    setRoom,
    rows,
    online,
    upsertLocal,
    removeLocal,
    reload,
    trackPresence,
  };
}

type RoomData = ReturnType<typeof useRoomData>;
export type Cafe = Rows & {
  room: Room;
  me: Player;
  isHost: boolean;
  online: Set<string>;
  upsertLocal: RoomData["upsertLocal"];
  removeLocal: RoomData["removeLocal"];
  setRoom: RoomData["setRoom"];
  reload: () => void;
  /** Await a Supabase write; on failure toast and resync from the database. */
  write: (query: PromiseLike<{ error: unknown }>) => Promise<boolean>;
  log: (text: string) => void;
  playerName: (id: string | null) => string;
};

const CafeContext = createContext<Cafe | null>(null);
export const CafeProvider = CafeContext.Provider;

export function useCafe(): Cafe {
  const ctx = useContext(CafeContext);
  if (!ctx) throw new Error("useCafe must be used inside CafeProvider");
  return ctx;
}

export function buildCafe(data: RoomData, me: Player): Cafe {
  const room = data.room!;
  const write: Cafe["write"] = async (query) => {
    const { error } = await query;
    if (!error) return true;
    console.error(error);
    toast.error("That didn't save. Resyncing with the room…");
    data.reload();
    return false;
  };
  return {
    ...data.rows,
    room,
    me,
    isHost: room.host_id === me.id,
    online: data.online,
    upsertLocal: data.upsertLocal,
    removeLocal: data.removeLocal,
    setRoom: data.setRoom,
    reload: data.reload,
    write,
    log: (text) => {
      void supabase
        .from("events")
        .insert({ room_id: room.id, player_id: me.id, text: text.slice(0, 300) })
        .then(({ error }) => error && console.error(error));
    },
    playerName: (id) => data.rows.players.find((p) => p.id === id)?.name ?? "someone",
  };
}
