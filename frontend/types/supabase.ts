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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          id: string
          kind: string
          message: string | null
          occurred_at: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          message?: string | null
          occurred_at?: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          message?: string | null
          occurred_at?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          color_hex: string
          created_at: string
          description: string | null
          id: string
          last_active_at: string | null
          name: string
          streak_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color_hex?: string
          created_at?: string
          description?: string | null
          id?: string
          last_active_at?: string | null
          name: string
          streak_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          description?: string | null
          id?: string
          last_active_at?: string | null
          name?: string
          streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clips: {
        Row: {
          artifact_prefix: string | null
          artifacts: Json | null
          created_at: string
          duration_s: number | null
          generation_job_id: string | null
          id: string
          job_id: string | null
          note: string | null
          source_creator: string | null
          source_platform: string | null
          source_url: string | null
          status: string
          style_dna: Json | null
          template_id: string | null
          thumbnail_color: string | null
          title: string
          topic_id: string
          updated_at: string
          user_id: string
          voice_ids: Json | null
        }
        Insert: {
          artifact_prefix?: string | null
          artifacts?: Json | null
          created_at?: string
          duration_s?: number | null
          generation_job_id?: string | null
          id?: string
          job_id?: string | null
          note?: string | null
          source_creator?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          template_id?: string | null
          thumbnail_color?: string | null
          title: string
          topic_id: string
          updated_at?: string
          user_id: string
          voice_ids?: Json | null
        }
        Update: {
          artifact_prefix?: string | null
          artifacts?: Json | null
          created_at?: string
          duration_s?: number | null
          generation_job_id?: string | null
          id?: string
          job_id?: string | null
          note?: string | null
          source_creator?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          template_id?: string | null
          thumbnail_color?: string | null
          title?: string
          topic_id?: string
          updated_at?: string
          user_id?: string
          voice_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clips_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          job_id: string
          message: string | null
          progress_pct: number | null
          stage: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: number
          job_id: string
          message?: string | null
          progress_pct?: number | null
          stage?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: number
          job_id?: string
          message?: string | null
          progress_pct?: number | null
          stage?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          artifact_prefix: string | null
          artifacts: Json | null
          audio_manifest: Json | null
          clip_context: string | null
          clip_id: string | null
          created_at: string
          error: string | null
          game_hint: string | null
          id: string
          kind: string
          source_type: string
          source_url: string | null
          status: string
          style_dna: Json | null
          updated_at: string
          user_id: string | null
          video_analysis: Json | null
        }
        Insert: {
          artifact_prefix?: string | null
          artifacts?: Json | null
          audio_manifest?: Json | null
          clip_context?: string | null
          clip_id?: string | null
          created_at?: string
          error?: string | null
          game_hint?: string | null
          id?: string
          kind?: string
          source_type: string
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          updated_at?: string
          user_id?: string | null
          video_analysis?: Json | null
        }
        Update: {
          artifact_prefix?: string | null
          artifacts?: Json | null
          audio_manifest?: Json | null
          clip_context?: string | null
          clip_id?: string | null
          created_at?: string
          error?: string | null
          game_hint?: string | null
          id?: string
          kind?: string
          source_type?: string
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          updated_at?: string
          user_id?: string | null
          video_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string
          joined_at: string
          last_studied_at: string | null
          streak_days: number
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id: string
          joined_at?: string
          last_studied_at?: string | null
          streak_days?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          last_studied_at?: string | null
          streak_days?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      templates: {
        Row: {
          class_id: string | null
          created_at: string
          description: string | null
          duration_s: number | null
          id: string
          name: string
          sfx_manifest: Json | null
          source_clip_id: string | null
          source_job_id: string | null
          style_dna: Json | null
          thumbnail_color: string | null
          updated_at: string
          user_id: string
          video_analysis: Json | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          duration_s?: number | null
          id?: string
          name: string
          sfx_manifest?: Json | null
          source_clip_id?: string | null
          source_job_id?: string | null
          style_dna?: Json | null
          thumbnail_color?: string | null
          updated_at?: string
          user_id: string
          video_analysis?: Json | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          duration_s?: number | null
          id?: string
          name?: string
          sfx_manifest?: Json | null
          source_clip_id?: string | null
          source_job_id?: string | null
          style_dna?: Json | null
          thumbnail_color?: string | null
          updated_at?: string
          user_id?: string
          video_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_source_clip_id_fkey"
            columns: ["source_clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          class_id: string
          created_at: string
          description: string | null
          id: string
          last_studied_at: string | null
          name: string
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string | null
          id?: string
          last_studied_at?: string | null
          name: string
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string | null
          id?: string
          last_studied_at?: string | null
          name?: string
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

// ─────────────────────────────────────────────────────────────────────
// Convenience aliases used across the app (`Row<'clips'>`, etc.).
// Preserved across type regeneration — the Supabase CLI omits these.
// ─────────────────────────────────────────────────────────────────────
type Pub = Database['public']['Tables']
export type Row<T extends keyof Pub> = Pub[T]['Row']
export type Insert<T extends keyof Pub> = Pub[T]['Insert']
export type Update<T extends keyof Pub> = Pub[T]['Update']
