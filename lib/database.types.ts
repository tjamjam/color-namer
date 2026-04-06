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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_meta: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      beach_statuses: {
        Row: {
          beach_id: string
          created_at: string
          id: string
          note: string | null
          source_date: string | null
          status: string
        }
        Insert: {
          beach_id: string
          created_at?: string
          id?: string
          note?: string | null
          source_date?: string | null
          status: string
        }
        Update: {
          beach_id?: string
          created_at?: string
          id?: string
          note?: string | null
          source_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "beach_statuses_beach_id_fkey"
            columns: ["beach_id"]
            isOneToOne: false
            referencedRelation: "beaches"
            referencedColumns: ["id"]
          },
        ]
      }
      beaches: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_official: boolean
          lat: number
          lon: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          lat: number
          lon: number
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          lat?: number
          lon?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      color_name_counts: {
        Row: {
          color_hex: string
          count: number
          language: string
          name: string
        }
        Insert: {
          color_hex: string
          count?: number
          language: string
          name: string
        }
        Update: {
          color_hex?: string
          count?: number
          language?: string
          name?: string
        }
        Relationships: []
      }
      lake_forecasts: {
        Row: {
          bullets: string[]
          created_at: string
          gage_level_ft: number | null
          gage_location: string | null
          gage_temp_f: number | null
          id: string
          issued_at: string
          wave_status: string
        }
        Insert: {
          bullets: string[]
          created_at?: string
          gage_level_ft?: number | null
          gage_location?: string | null
          gage_temp_f?: number | null
          id?: string
          issued_at: string
          wave_status: string
        }
        Update: {
          bullets?: string[]
          created_at?: string
          gage_level_ft?: number | null
          gage_location?: string | null
          gage_temp_f?: number | null
          id?: string
          issued_at?: string
          wave_status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cancel_at: string | null
          created_at: string
          daily_digest: boolean
          id: string
          is_subscribed: boolean
          subscribed_beaches: string[] | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string
          daily_digest?: boolean
          id: string
          is_subscribed?: boolean
          subscribed_beaches?: string[] | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          created_at?: string
          daily_digest?: boolean
          id?: string
          is_subscribed?: boolean
          subscribed_beaches?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          color_hex: string
          created_at: string
          cvd_type: string | null
          id: string
          language: string
          locale: string
          name: string
          user_token: string
        }
        Insert: {
          color_hex: string
          created_at?: string
          cvd_type?: string | null
          id?: string
          language: string
          locale: string
          name: string
          user_token: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          cvd_type?: string | null
          id?: string
          language?: string
          locale?: string
          name?: string
          user_token?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          cvd_type: string
          updated_at: string
          user_token: string
        }
        Insert: {
          cvd_type: string
          updated_at?: string
          user_token: string
        }
        Update: {
          cvd_type?: string
          updated_at?: string
          user_token?: string
        }
        Relationships: []
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
