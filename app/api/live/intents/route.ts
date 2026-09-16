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
    .from("execution_intents")
    .select("id, workspace_id, strategy_id, account_connection_id, idempotency_key, side, reduce_only, position_notional, status, blocked_reasons, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load execution intents" }, { status: 500 });
  return NextResponse.json({ intents: data });
}
