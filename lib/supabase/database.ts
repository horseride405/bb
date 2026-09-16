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
          live_emergency_stop_active: boolean;
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
          live_emergency_stop_active?: boolean;
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
      binance_account_connections: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          environment: "testnet" | "mainnet";
          status: "pending" | "connected" | "disabled" | "error";
          api_key_last4: string | null;
          last_verified_at: string | null;
          last_error: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          environment?: "testnet" | "mainnet";
          status?: "pending" | "connected" | "disabled" | "error";
          api_key_last4?: string | null;
          last_verified_at?: string | null;
          last_error?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["binance_account_connections"]["Insert"]>;
        Relationships: [];
      };
      binance_account_secrets: {
        Row: {
          account_connection_id: string;
          secret_ref: string;
          created_at: string;
        };
        Insert: {
          account_connection_id: string;
          secret_ref: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["binance_account_secrets"]["Insert"]>;
        Relationships: [];
      };
      live_strategy_approvals: {
        Row: {
          id: string;
          workspace_id: string;
          strategy_id: string;
          account_connection_id: string;
          approved_by: string;
          approved_at: string;
          expires_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          strategy_id: string;
          account_connection_id: string;
          approved_by: string;
          approved_at?: string;
          expires_at: string;
          revoked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["live_strategy_approvals"]["Insert"]>;
        Relationships: [];
      };
      reconciliation_snapshots: {
        Row: {
          id: string;
          workspace_id: string;
          account_connection_id: string;
          observed_at: string;
          status: "healthy" | "mismatch" | "stale" | "error";
          balances: Json;
          positions: Json;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          account_connection_id: string;
          observed_at: string;
          status: "healthy" | "mismatch" | "stale" | "error";
          balances?: Json;
          positions?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reconciliation_snapshots"]["Insert"]>;
        Relationships: [];
      };
      execution_intents: {
        Row: {
          id: string;
          workspace_id: string;
          strategy_id: string;
          account_connection_id: string;
          idempotency_key: string;
          side: "long" | "short" | "flat";
          reduce_only: boolean;
          position_notional: number;
          status: "pending" | "blocked" | "preflighted" | "cancelled";
          risk_snapshot: Json;
          blocked_reasons: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          strategy_id: string;
          account_connection_id: string;
          idempotency_key: string;
          side: "long" | "short" | "flat";
          reduce_only?: boolean;
          position_notional: number;
          status?: "pending" | "blocked" | "preflighted" | "cancelled";
          risk_snapshot?: Json;
          blocked_reasons?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["execution_intents"]["Insert"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          workspace_id: string;
          actor_user_id: string | null;
          event_type: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          actor_user_id?: string | null;
          event_type: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Insert"]>;
        Relationships: [];
      };
      execution_worker_heartbeats: {
        Row: {
          id: string;
          workspace_id: string;
          account_connection_id: string;
          worker_name: string;
          status: "healthy" | "degraded" | "offline";
          observed_at: string;
          last_success_at: string | null;
          consecutive_failures: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          account_connection_id: string;
          worker_name: string;
          status: "healthy" | "degraded" | "offline";
          observed_at: string;
          last_success_at?: string | null;
          consecutive_failures?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["execution_worker_heartbeats"]["Insert"]>;
        Relationships: [];
      };
      execution_orders: {
        Row: {
          id: string;
          workspace_id: string;
          execution_intent_id: string;
          account_connection_id: string;
          client_order_id: string;
          exchange_order_id: string | null;
          symbol: string;
          side: "buy" | "sell";
          order_type: "market" | "limit";
          quantity: number;
          reduce_only: boolean;
          status: "pending" | "submitted" | "partially_filled" | "filled" | "cancelled" | "rejected";
          rejection_reason: string | null;
          submitted_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          execution_intent_id: string;
          account_connection_id: string;
          client_order_id: string;
          exchange_order_id?: string | null;
          symbol: string;
          side: "buy" | "sell";
          order_type: "market" | "limit";
          quantity: number;
          reduce_only?: boolean;
          status?: "pending" | "submitted" | "partially_filled" | "filled" | "cancelled" | "rejected";
          rejection_reason?: string | null;
          submitted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["execution_orders"]["Insert"]>;
        Relationships: [];
      };
      execution_fills: {
        Row: {
          id: string;
          workspace_id: string;
          execution_order_id: string;
          account_connection_id: string;
          exchange_trade_id: string;
          price: number;
          quantity: number;
          fee: number;
          fee_asset: string | null;
          executed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          execution_order_id: string;
          account_connection_id: string;
          exchange_trade_id: string;
          price: number;
          quantity: number;
          fee?: number;
          fee_asset?: string | null;
          executed_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["execution_fills"]["Insert"]>;
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
      record_audit_event: {
        Args: {
          target_workspace_id: string;
          target_event_type: string;
          target_resource_type: string;
          target_resource_id: string | null;
          target_metadata?: Json;
        };
        Returns: Database["public"]["Tables"]["audit_events"]["Row"][];
      };
    };
    Enums: {
      workspace_role: "owner" | "admin" | "trader" | "viewer";
      strategy_status: "draft" | "ready" | "running" | "paused" | "archived";
      strategy_mode: "paper" | "backtest" | "live";
      validation_run_type: "paper" | "backtest";
      validation_run_status: "queued" | "running" | "completed" | "failed" | "cancelled";
      binance_account_environment: "testnet" | "mainnet";
      binance_account_status: "pending" | "connected" | "disabled" | "error";
      reconciliation_status: "healthy" | "mismatch" | "stale" | "error";
      execution_intent_status: "pending" | "blocked" | "preflighted" | "cancelled";
      execution_worker_status: "healthy" | "degraded" | "offline";
      execution_order_status: "pending" | "submitted" | "partially_filled" | "filled" | "cancelled" | "rejected";
    };
    CompositeTypes: Record<string, never>;
  };
};
