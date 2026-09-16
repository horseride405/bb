import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RiskInput = {
  workspace_id?: unknown;
  leverage?: unknown;
  position_notional?: unknown;
  daily_loss_pct?: unknown;
  open_positions?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: RiskInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    typeof body.workspace_id !== "string" ||
    typeof body.leverage !== "number" ||
    typeof body.position_notional !== "number" ||
    typeof body.daily_loss_pct !== "number" ||
    typeof body.open_positions !== "number"
  ) {
    return NextResponse.json({ error: "Workspace and numeric risk inputs are required" }, { status: 400 });
  }

  const { data: policy, error } = await supabase
    .from("risk_policies")
    .select("*")
    .eq("workspace_id", body.workspace_id)
    .single();

  if (error || !policy) {
    return NextResponse.json({ error: "Risk policy not found" }, { status: 404 });
  }

  const violations: string[] = [];
  if (body.leverage > policy.max_leverage) violations.push("leverage_exceeds_limit");
  if (body.position_notional > policy.max_position_notional) violations.push("position_notional_exceeds_limit");
  if (body.daily_loss_pct > policy.max_daily_loss_pct) violations.push("daily_loss_exceeds_limit");
  if (body.open_positions > policy.max_open_positions) violations.push("open_positions_exceeds_limit");

  return NextResponse.json({
    allowed: violations.length === 0,
    live_trading_enabled: policy.live_trading_enabled,
    violations,
  });
}
