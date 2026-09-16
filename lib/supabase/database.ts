export type Json =
  | boolean
  | number
  | string
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      strategies: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description: string | null;
          status: "draft" | "ready" | "running" | "paused" | "archived";
          mode: "paper" | "backtest" | "live";
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description?: string | null;
          status?: "draft" | "ready" | "running" | "paused" | "archived";
          mode?: "paper" | "backtest" | "live";
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["strategies"]["Insert"]>;
        Relationships: [];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: "owner" | "admin" | "trader" | "viewer";
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role?: "owner" | "admin" | "trader" | "viewer";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_members"]["Insert"]>;
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
        Relationships: [];
      };
      risk_policies: {
        Row: {
          id: string;
          workspace_id: string;
          max_leverage: number;
          max_position_notional: number;
          max_daily_loss_pct: number;
          max_drawdown_pct: number;
          max_open_positions: number;
          min_liquidation_distance_pct: number;
          live_trading_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          max_leverage?: number;
          max_position_notional?: number;
          max_daily_loss_pct?: number;
          max_drawdown_pct?: number;
          max_open_positions?: number;
          min_liquidation_distance_pct?: number;
          live_trading_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["risk_policies"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_workspace: {
        Args: {
          workspace_name: string;
          workspace_slug: string;
        };
        Returns: Database["public"]["Tables"]["workspaces"]["Row"][];
      };
    };
    Enums: {
      workspace_role: "owner" | "admin" | "trader" | "viewer";
      strategy_status: "draft" | "ready" | "running" | "paused" | "archived";
      strategy_mode: "paper" | "backtest" | "live";
    };
    CompositeTypes: Record<string, never>;
  };
};
