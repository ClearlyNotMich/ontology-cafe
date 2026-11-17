import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Room = Tables["rooms"]["Row"];
export type Player = Tables["players"]["Row"];
export type Card = Tables["cards"]["Row"];
export type Pile = Tables["piles"]["Row"];
export type Link = Tables["links"]["Row"];
export type CafeEvent = Tables["events"]["Row"];
export type Round = Tables["tq_rounds"]["Row"];
export type Question = Tables["tq_questions"]["Row"];

export type Answer = "yes" | "no" | "sometimes" | "out_of_scope";
export type Tag = "class" | "property";
