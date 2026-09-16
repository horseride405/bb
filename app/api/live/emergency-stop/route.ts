import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: { workspace_id?: unknown; active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.workspace_id !== "string" || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Workspace and boolean active state are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("risk_policies")
    .update({ live_emergency_stop_active: body.active })
    .eq("workspace_id", body.workspace_id)
    .select("workspace_id, live_emergency_stop_active, live_trading_enabled, kill_switch_active")
    .single();
  if (error || !data) return NextResponse.json({ error: "Only workspace admins can change the emergency stop" }, { status: 403 });
  return NextResponse.json({ emergency_stop_active: data.live_emergency_stop_active, live_trading_enabled: data.live_trading_enabled });
}
