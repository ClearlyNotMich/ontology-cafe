export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cards: {
        Row: {
          author_id: string | null
          co_author_ids: string[]
          created_at: string
          id: string
          note: string
          pile_id: string | null
          position: number
          room_id: string
          text: string
        }
        Insert: {
          author_id?: string | null
          co_author_ids?: string[]
          created_at?: string
          id?: string
          note?: string
          pile_id?: string | null
          position?: number
          room_id: string
          text: string
        }
        Update: {
          author_id?: string | null
          co_author_ids?: string[]
          created_at?: string
          id?: string
          note?: string
          pile_id?: string | null
          position?: number
          room_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pile_id_fkey"
            columns: ["pile_id"]
            isOneToOne: false
            referencedRelation: "piles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          id: string
          player_id: string | null
          room_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id?: string | null
          room_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string | null
          room_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          from_pile_id: string
          id: string
          label: string
          reason: string
          room_id: string
          to_pile_id: string
        }
        Insert: {
          created_at?: string
          from_pile_id: string
          id?: string
          label: string
          reason?: string
          room_id: string
          to_pile_id: string
        }
        Update: {
          created_at?: string
          from_pile_id?: string
          id?: string
          label?: string
          reason?: string
          room_id?: string
          to_pile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_from_pile_id_fkey"
            columns: ["from_pile_id"]
            isOneToOne: false
            referencedRelation: "piles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_to_pile_id_fkey"
            columns: ["to_pile_id"]
            isOneToOne: false
            referencedRelation: "piles"
            referencedColumns: ["id"]
          },
        ]
      }
      piles: {
        Row: {
          collapsed: boolean
          color: string
          created_at: string
          id: string
          name: string
          position: number
          reason: string
          room_id: string
        }
        Insert: {
          collapsed?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          reason?: string
          room_id: string
        }
        Update: {
          collapsed?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          reason?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piles_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          color: string
          confirmed: boolean
          created_at: string
          id: string
          name: string
          room_id: string
        }
        Insert: {
          color: string
          confirmed?: boolean
          created_at?: string
          id: string
          name: string
          room_id: string
        }
        Update: {
          color?: string
          confirmed?: boolean
          created_at?: string
          id?: string
          name?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          cs_phase: string
          host_id: string | null
          id: string
          scope: string
          topic: string
        }
        Insert: {
          code: string
          created_at?: string
          cs_phase?: string
          host_id?: string | null
          id?: string
          scope?: string
          topic?: string
        }
        Update: {
          code?: string
          created_at?: string
          cs_phase?: string
          host_id?: string | null
          id?: string
          scope?: string
          topic?: string
        }
        Relationships: []
      }
      tq_questions: {
        Row: {
          answer: string | null
          asker_id: string | null
          correct: boolean | null
          created_at: string
          id: string
          kind: string
          room_id: string
          round_id: string
          tag: string | null
          text: string
        }
        Insert: {
          answer?: string | null
          asker_id?: string | null
          correct?: boolean | null
          created_at?: string
          id?: string
          kind?: string
          room_id: string
          round_id: string
          tag?: string | null
          text: string
        }
        Update: {
          answer?: string | null
          asker_id?: string | null
          correct?: boolean | null
          created_at?: string
          id?: string
          kind?: string
          room_id?: string
          round_id?: string
          tag?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "tq_questions_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tq_questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tq_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tq_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      tq_rounds: {
        Row: {
          barista_id: string | null
          concept: string | null
          created_at: string
          ended_at: string | null
          id: string
          number: number
          room_id: string
          status: string
          winner_id: string | null
        }
        Insert: {
          barista_id?: string | null
          concept?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          number: number
          room_id: string
          status?: string
          winner_id?: string | null
        }
        Update: {
          barista_id?: string | null
          concept?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          number?: number
          room_id?: string
          status?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tq_rounds_barista_id_fkey"
            columns: ["barista_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tq_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tq_rounds_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
