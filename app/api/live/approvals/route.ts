import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  let query = supabase
    .from("live_strategy_approvals")
    .select("id, workspace_id, strategy_id, account_connection_id, approved_at, expires_at, revoked_at")
    .order("approved_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load live approvals" }, { status: 500 });
  return NextResponse.json({ approvals: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: {
    workspace_id?: unknown;
    strategy_id?: unknown;
    account_connection_id?: unknown;
    expires_at?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    typeof body.workspace_id !== "string" ||
    typeof body.strategy_id !== "string" ||
    typeof body.account_connection_id !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    return NextResponse.json({ error: "Workspace, strategy, account, and expiry are required" }, { status: 400 });
  }
  const expiresAt = Date.parse(body.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ error: "Approval expiry must be a future timestamp" }, { status: 400 });
  }

  const { data: strategy } = await supabase
    .from("strategies")
    .select("id")
    .eq("id", body.strategy_id)
    .eq("workspace_id", body.workspace_id)
    .single();
  const { data: account } = await supabase
    .from("binance_account_connections")
    .select("id")
    .eq("id", body.account_connection_id)
    .eq("workspace_id", body.workspace_id)
    .single();
  if (!strategy || !account) {
    return NextResponse.json({ error: "Strategy and account must belong to the workspace" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("live_strategy_approvals")
    .upsert({
      workspace_id: body.workspace_id,
      strategy_id: body.strategy_id,
      account_connection_id: body.account_connection_id,
      approved_by: user.id,
      expires_at: new Date(expiresAt).toISOString(),
      revoked_at: null,
    }, { onConflict: "strategy_id,account_connection_id" })
    .select("id, strategy_id, account_connection_id, approved_at, expires_at, revoked_at")
    .single();
  if (error) return NextResponse.json({ error: "Only workspace admins can approve live strategy access" }, { status: 403 });
  const { error: auditError } = await supabase.rpc("record_audit_event", {
    target_workspace_id: body.workspace_id,
    target_event_type: "live_approval_granted",
    target_resource_type: "strategy",
    target_resource_id: body.strategy_id,
    target_metadata: { account_connection_id: body.account_connection_id, expires_at: new Date(expiresAt).toISOString() },
  });
  if (auditError) return NextResponse.json({ error: "Approval changed but audit recording failed" }, { status: 500 });
  return NextResponse.json({ approval: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: { workspace_id?: unknown; strategy_id?: unknown; account_connection_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    typeof body.workspace_id !== "string" ||
    typeof body.strategy_id !== "string" ||
    typeof body.account_connection_id !== "string"
  ) {
    return NextResponse.json({ error: "Workspace, strategy, and account are required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("live_strategy_approvals")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", body.workspace_id)
    .eq("strategy_id", body.strategy_id)
    .eq("account_connection_id", body.account_connection_id)
    .select("id, revoked_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Approval not found or admin access denied" }, { status: 404 });
  const { error: auditError } = await supabase.rpc("record_audit_event", {
    target_workspace_id: body.workspace_id,
    target_event_type: "live_approval_revoked",
    target_resource_type: "strategy",
    target_resource_id: body.strategy_id,
    target_metadata: { account_connection_id: body.account_connection_id },
  });
  if (auditError) return NextResponse.json({ error: "Approval revoked but audit recording failed" }, { status: 500 });
  return NextResponse.json({ approval: data });
}
