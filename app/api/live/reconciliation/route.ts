import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const workspaceId = params.get("workspace_id");
  const accountConnectionId = params.get("account_connection_id");
  let query = supabase
    .from("reconciliation_snapshots")
    .select("id, workspace_id, account_connection_id, observed_at, status, balances, positions, error_message, created_at")
    .order("observed_at", { ascending: false })
    .limit(50);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (accountConnectionId) query = query.eq("account_connection_id", accountConnectionId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load reconciliation snapshots" }, { status: 500 });
  return NextResponse.json({ snapshots: data });
}
