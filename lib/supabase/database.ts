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
          max_trades_per_hour: number;
          min_trade_interval_seconds: number;
          kill_switch_active: boolean;
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
          max_trades_per_hour?: number;
          min_trade_interval_seconds?: number;
          kill_switch_active?: boolean;
          live_trading_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["risk_policies"]["Insert"]>;
        Relationships: [];
      };
      strategy_runs: {
        Row: {
          id: string;
          workspace_id: string;
          strategy_id: string;
          requested_by: string;
          run_type: "paper" | "backtest";
          status: "queued" | "running" | "completed" | "failed" | "cancelled";
          parameters: Json;
          results: Json | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          strategy_id: string;
          requested_by: string;
          run_type: "paper" | "backtest";
          status?: "queued" | "running" | "completed" | "failed" | "cancelled";
          parameters?: Json;
          results?: Json | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["strategy_runs"]["Insert"]>;
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
      claim_next_validation_run: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["strategy_runs"]["Row"][];
      };
      complete_validation_run: {
        Args: {
          run_id: string;
          run_results: Json;
        };
        Returns: Database["public"]["Tables"]["strategy_runs"]["Row"][];
      };
      fail_validation_run: {
        Args: {
          run_id: string;
          failure_message: string;
        };
        Returns: Database["public"]["Tables"]["strategy_runs"]["Row"][];
      };
    };
    Enums: {
      workspace_role: "owner" | "admin" | "trader" | "viewer";
      strategy_status: "draft" | "ready" | "running" | "paused" | "archived";
      strategy_mode: "paper" | "backtest" | "live";
      validation_run_type: "paper" | "backtest";
      validation_run_status: "queued" | "running" | "completed" | "failed" | "cancelled";
    };
    CompositeTypes: Record<string, never>;
  };
};
