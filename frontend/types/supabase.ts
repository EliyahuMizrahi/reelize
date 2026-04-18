export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          created_at: string
          duration_s: number | null
          id: string
          job_id: string | null
          source_creator: string | null
          source_platform: string | null
          source_url: string | null
          status: string
          style_dna: Json | null
          thumbnail_color: string | null
          title: string
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_prefix?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          job_id?: string | null
          source_creator?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          thumbnail_color?: string | null
          title: string
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_prefix?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          job_id?: string | null
          source_creator?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          style_dna?: Json | null
          thumbnail_color?: string | null
          title?: string
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      jobs: {
        Row: {
          artifact_prefix: string | null
          audio_manifest: Json | null
          clip_context: string | null
          clip_id: string | null
          created_at: string
          error: string | null
          game_hint: string | null
          id: string
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string | null
          video_analysis: Json | null
        }
        Insert: {
          artifact_prefix?: string | null
          audio_manifest?: Json | null
          clip_context?: string | null
          clip_id?: string | null
          created_at?: string
          error?: string | null
          game_hint?: string | null
          id?: string
          source_type: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          video_analysis?: Json | null
        }
        Update: {
          artifact_prefix?: string | null
          audio_manifest?: Json | null
          clip_context?: string | null
          clip_id?: string | null
          created_at?: string
          error?: string | null
          game_hint?: string | null
          id?: string
          source_type?: string
          source_url?: string | null
          status?: string
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
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Row / Insert / Update helpers keyed by table name
type Pub = Database['public']['Tables'];
export type Row<T extends keyof Pub> = Pub[T]['Row'];
export type Insert<T extends keyof Pub> = Pub[T]['Insert'];
export type Update<T extends keyof Pub> = Pub[T]['Update'];
