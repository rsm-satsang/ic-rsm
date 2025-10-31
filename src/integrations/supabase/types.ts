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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_logs: {
        Row: {
          action_type: string
          compiled_prompt: string
          created_at: string
          created_by: string
          id: string
          metadata: Json | null
          project_id: string
          response: string | null
          version_id: string | null
        }
        Insert: {
          action_type: string
          compiled_prompt: string
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json | null
          project_id: string
          response?: string | null
          version_id?: string | null
        }
        Update: {
          action_type?: string
          compiled_prompt?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          response?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          added_by: string | null
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          added_by?: string | null
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          added_by?: string | null
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          created_at: string
          id: string
          inline_reference: Json | null
          project_id: string
          resolved: boolean | null
          text: string
          updated_at: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inline_reference?: Json | null
          project_id: string
          resolved?: boolean | null
          text: string
          updated_at?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inline_reference?: Json | null
          project_id?: string
          resolved?: boolean | null
          text?: string
          updated_at?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          is_vocabulary: boolean | null
          metadata: Json | null
          mime_type: string | null
          name: string
          parsed_keywords: Json | null
          project_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          is_vocabulary?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          name: string
          parsed_keywords?: Json | null
          project_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          is_vocabulary?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          name?: string
          parsed_keywords?: Json | null
          project_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
          value_encrypted: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          value_encrypted: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          value_encrypted?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          language: string | null
          metadata: Json | null
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          title: string
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          scope: Database["public"]["Enums"]["prompt_scope"]
          scope_id: string | null
          template: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          scope: Database["public"]["Enums"]["prompt_scope"]
          scope_id?: string | null
          template: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          scope?: Database["public"]["Enums"]["prompt_scope"]
          scope_id?: string | null
          template?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_status: Database["public"]["Enums"]["project_status"]
          old_status: Database["public"]["Enums"]["project_status"] | null
          project_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_status: Database["public"]["Enums"]["project_status"]
          old_status?: Database["public"]["Enums"]["project_status"] | null
          project_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_status?: Database["public"]["Enums"]["project_status"]
          old_status?: Database["public"]["Enums"]["project_status"] | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline: {
        Row: {
          created_at: string
          event_details: Json
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          project_id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          event_details?: Json
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          project_id: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          event_details?: Json
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          project_id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          preferences: Json | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          preferences?: Json | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          preferences?: Json | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      versions: {
        Row: {
          content: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          project_id: string
          title: string | null
          version_number: number
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          project_id: string
          title?: string | null
          version_number: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          project_id?: string
          title?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabularies: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          file_url: string | null
          id: string
          name: string
          parsed_keywords: Json
          project_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["vocab_visibility"]
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          file_url?: string | null
          id?: string
          name: string
          parsed_keywords?: Json
          project_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["vocab_visibility"]
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          file_url?: string | null
          id?: string
          name?: string
          parsed_keywords?: Json
          project_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["vocab_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "vocabularies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabularies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      access_level: "owner" | "editor" | "viewer"
      app_role: "admin" | "user"
      event_type:
        | "created"
        | "edited"
        | "ai_action"
        | "comment"
        | "status_change"
        | "version_created"
        | "collaborator_added"
        | "file_uploaded"
        | "vocab_added"
      project_status:
        | "draft"
        | "in_progress"
        | "review"
        | "approved"
        | "published"
      project_type: "document" | "note" | "article" | "email"
      prompt_scope: "user" | "project" | "org"
      vocab_visibility: "project" | "org" | "public"
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
    Enums: {
      access_level: ["owner", "editor", "viewer"],
      app_role: ["admin", "user"],
      event_type: [
        "created",
        "edited",
        "ai_action",
        "comment",
        "status_change",
        "version_created",
        "collaborator_added",
        "file_uploaded",
        "vocab_added",
      ],
      project_status: [
        "draft",
        "in_progress",
        "review",
        "approved",
        "published",
      ],
      project_type: ["document", "note", "article", "email"],
      prompt_scope: ["user", "project", "org"],
      vocab_visibility: ["project", "org", "public"],
    },
  },
} as const
