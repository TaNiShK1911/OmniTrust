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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor: string
          category: string
          created_at: string
          decision: string | null
          entity: string
          event_type: string
          id: string
          latency_ms: number | null
          negotiation_id: string | null
          order_id: string | null
          payload: Json
          request_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          actor: string
          category: string
          created_at?: string
          decision?: string | null
          entity?: string
          event_type: string
          id?: string
          latency_ms?: number | null
          negotiation_id?: string | null
          order_id?: string | null
          payload?: Json
          request_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          actor?: string
          category?: string
          created_at?: string
          decision?: string | null
          entity?: string
          event_type?: string
          id?: string
          latency_ms?: number | null
          negotiation_id?: string | null
          order_id?: string | null
          payload?: Json
          request_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          confidence: number | null
          created_at: string
          decision: string | null
          id: string
          order_id: string
          penalty_pct: number | null
          reason: string
          refund_amount: number | null
          refund_ref: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          decision?: string | null
          id?: string
          order_id: string
          penalty_pct?: number | null
          reason?: string
          refund_amount?: number | null
          refund_ref?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          decision?: string | null
          id?: string
          order_id?: string
          penalty_pct?: number | null
          reason?: string
          refund_amount?: number | null
          refund_ref?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiations: {
        Row: {
          agreed_unit_price: number | null
          buyer_target: number
          created_at: string
          id: string
          max_turns: number
          product_id: string
          quantity: number
          status: string
          turn_count: number
          turns: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          agreed_unit_price?: number | null
          buyer_target: number
          created_at?: string
          id?: string
          max_turns?: number
          product_id: string
          quantity?: number
          status?: string
          turn_count?: number
          turns?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          agreed_unit_price?: number | null
          buyer_target?: number
          created_at?: string
          id?: string
          max_turns?: number
          product_id?: string
          quantity?: number
          status?: string
          turn_count?: number
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          escrow_ref: string | null
          escrow_status: string
          id: string
          idempotency_key: string | null
          negotiation_id: string | null
          product_id: string
          product_name: string
          quantity: number
          refund_amount: number | null
          refund_ref: string | null
          settlement_ref: string | null
          status: string
          total_amount: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          escrow_ref?: string | null
          escrow_status?: string
          id?: string
          idempotency_key?: string | null
          negotiation_id?: string | null
          product_id: string
          product_name: string
          quantity: number
          refund_amount?: number | null
          refund_ref?: string | null
          settlement_ref?: string | null
          status?: string
          total_amount: number
          unit_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          escrow_ref?: string | null
          escrow_status?: string
          id?: string
          idempotency_key?: string | null
          negotiation_id?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          refund_amount?: number | null
          refund_ref?: string | null
          settlement_ref?: string | null
          status?: string
          total_amount?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          currency: string
          description: string
          id: string
          list_price: number
          name: string
          price_floor: number
          sku: string
          stock: number
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          list_price: number
          name: string
          price_floor: number
          sku: string
          stock?: number
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          list_price?: number
          name?: string
          price_floor?: number
          sku?: string
          stock?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string
          created_at: string
          demo_scenario: string
          full_name: string
          id: string
          onboarding_completed: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          company?: string
          created_at?: string
          demo_scenario?: string
          full_name?: string
          id: string
          onboarding_completed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          demo_scenario?: string
          full_name?: string
          id?: string
          onboarding_completed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier: string
          condition: string
          created_at: string
          id: string
          last_event_at: string
          order_id: string
          status: string
          tracking_id: string
          user_id: string
        }
        Insert: {
          carrier?: string
          condition?: string
          created_at?: string
          id?: string
          last_event_at?: string
          order_id: string
          status?: string
          tracking_id: string
          user_id: string
        }
        Update: {
          carrier?: string
          condition?: string
          created_at?: string
          id?: string
          last_event_at?: string
          order_id?: string
          status?: string
          tracking_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      app_role: "buyer" | "seller"
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
      app_role: ["buyer", "seller"],
    },
  },
} as const
