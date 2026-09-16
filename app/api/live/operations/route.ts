import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });

  const [policyResult, accountsResult, approvalsResult, intentsResult, snapshotsResult] = await Promise.all([
    supabase
      .from("risk_policies")
      .select("workspace_id, live_trading_enabled, live_emergency_stop_active, kill_switch_active")
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("binance_account_connections")
      .select("id, name, environment, status, api_key_last4, last_verified_at, last_error")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("live_strategy_approvals")
      .select("id, strategy_id, account_connection_id, approved_at, expires_at, revoked_at")
      .eq("workspace_id", workspaceId)
      .order("approved_at", { ascending: false }),
    supabase
      .from("execution_intents")
      .select("id, strategy_id, account_connection_id, side, reduce_only, position_notional, status, blocked_reasons, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("reconciliation_snapshots")
      .select("id, account_connection_id, observed_at, status, error_message")
      .eq("workspace_id", workspaceId)
      .order("observed_at", { ascending: false })
      .limit(20),
  ]);

  if (policyResult.error || accountsResult.error || approvalsResult.error || intentsResult.error || snapshotsResult.error) {
    return NextResponse.json({ error: "Unable to load live operations state" }, { status: 500 });
  }
  return NextResponse.json({
    policy: policyResult.data,
    accounts: accountsResult.data,
    approvals: approvalsResult.data,
    intents: intentsResult.data,
    reconciliation: snapshotsResult.data,
  });
}
