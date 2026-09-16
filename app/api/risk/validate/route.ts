import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RiskInput = {
  workspace_id?: unknown;
  position_side?: unknown;
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
    (body.position_side !== undefined &&
      body.position_side !== "long" &&
      body.position_side !== "short") ||
    typeof body.leverage !== "number" ||
    typeof body.position_notional !== "number" ||
    typeof body.daily_loss_pct !== "number" ||
    typeof body.open_positions !== "number"
  ) {
    return NextResponse.json({ error: "Workspace and numeric risk inputs are required" }, { status: 400 });
  }
  if (
    !Number.isFinite(body.leverage) ||
    !Number.isFinite(body.position_notional) ||
    !Number.isFinite(body.daily_loss_pct) ||
    !Number.isFinite(body.open_positions) ||
    body.leverage < 0 ||
    body.position_notional < 0 ||
    body.daily_loss_pct < 0 ||
    body.open_positions < 0
  ) {
    return NextResponse.json({ error: "Risk inputs must be finite and non-negative" }, { status: 400 });
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
    position_side: body.position_side ?? "net",
    violations,
  });
}
