import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RiskInput = {
  workspace_id?: unknown;
  position_side?: unknown;
  leverage?: unknown;
  position_notional?: unknown;
  daily_loss_pct?: unknown;
  open_positions?: unknown;
  gross_exposure_notional?: unknown;
  concentration_exposure_notional?: unknown;
  trades_in_window?: unknown;
  window_hours?: unknown;
  seconds_since_last_trade?: unknown;
  mark_price?: unknown;
  liquidation_price?: unknown;
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
  const hasLiquidationInputs = body.mark_price !== undefined || body.liquidation_price !== undefined;
  if (
    hasLiquidationInputs &&
    (body.position_side !== "long" && body.position_side !== "short" ||
      typeof body.mark_price !== "number" ||
      typeof body.liquidation_price !== "number" ||
      !Number.isFinite(body.mark_price) ||
      !Number.isFinite(body.liquidation_price) ||
      body.mark_price <= 0 ||
      body.liquidation_price <= 0)
  ) {
    return NextResponse.json(
      { error: "Liquidation checks require a long/short side and positive mark/liquidation prices" },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(body.leverage) ||
    !Number.isFinite(body.position_notional) ||
    !Number.isFinite(body.daily_loss_pct) ||
    !Number.isFinite(body.open_positions) ||
    (body.gross_exposure_notional !== undefined &&
      (typeof body.gross_exposure_notional !== "number" || !Number.isFinite(body.gross_exposure_notional))) ||
    (body.concentration_exposure_notional !== undefined &&
      (typeof body.concentration_exposure_notional !== "number" ||
        !Number.isFinite(body.concentration_exposure_notional))) ||
    (body.trades_in_window !== undefined &&
      (typeof body.trades_in_window !== "number" || !Number.isFinite(body.trades_in_window))) ||
    (body.window_hours !== undefined &&
      (typeof body.window_hours !== "number" || !Number.isFinite(body.window_hours))) ||
    (body.seconds_since_last_trade !== undefined &&
      (typeof body.seconds_since_last_trade !== "number" || !Number.isFinite(body.seconds_since_last_trade))) ||
    body.leverage < 0 ||
    body.position_notional < 0 ||
    body.daily_loss_pct < 0 ||
    body.open_positions < 0
    || (typeof body.gross_exposure_notional === "number" && body.gross_exposure_notional < 0)
    || (typeof body.concentration_exposure_notional === "number" && body.concentration_exposure_notional < 0)
    || (typeof body.trades_in_window === "number" && body.trades_in_window < 0)
    || (typeof body.window_hours === "number" && body.window_hours <= 0)
    || (typeof body.seconds_since_last_trade === "number" && body.seconds_since_last_trade < 0)
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
  if (policy.kill_switch_active) violations.push("workspace_kill_switch_active");
  const maxGrossExposureNotional = policy.max_position_notional * policy.max_open_positions;
  const grossExposureNotional =
    typeof body.gross_exposure_notional === "number"
      ? body.gross_exposure_notional
      : body.position_notional * body.open_positions;
  const concentrationExposureNotional =
    typeof body.concentration_exposure_notional === "number"
      ? body.concentration_exposure_notional
      : body.position_notional;
  if (grossExposureNotional > maxGrossExposureNotional) {
    violations.push("gross_exposure_exceeds_limit");
  }
  if (concentrationExposureNotional > maxGrossExposureNotional) {
    violations.push("concentration_exposure_exceeds_limit");
  }
  const tradeFrequencyPerHour =
    typeof body.trades_in_window === "number" && typeof body.window_hours === "number"
      ? body.trades_in_window / body.window_hours
      : null;
  if (tradeFrequencyPerHour !== null && tradeFrequencyPerHour > policy.max_trades_per_hour) {
    violations.push("trade_frequency_exceeds_limit");
  }
  if (
    typeof body.seconds_since_last_trade === "number" &&
    body.seconds_since_last_trade < policy.min_trade_interval_seconds
  ) {
    violations.push("trade_cooldown_active");
  }
  let liquidationDistancePct: number | null = null;
  if (hasLiquidationInputs) {
    liquidationDistancePct =
      body.position_side === "long"
        ? ((body.mark_price as number - (body.liquidation_price as number)) / (body.mark_price as number)) * 100
        : (((body.liquidation_price as number) - (body.mark_price as number)) / (body.mark_price as number)) * 100;
    if (liquidationDistancePct <= 0 || liquidationDistancePct < policy.min_liquidation_distance_pct) {
      violations.push("liquidation_distance_below_limit");
    }
  }

  return NextResponse.json({
    allowed: violations.length === 0,
    live_trading_enabled: policy.live_trading_enabled,
    position_side: body.position_side ?? "net",
    liquidation_distance_pct: liquidationDistancePct,
    min_liquidation_distance_pct: policy.min_liquidation_distance_pct,
    gross_exposure_notional: grossExposureNotional,
    concentration_exposure_notional: concentrationExposureNotional,
    max_gross_exposure_notional: maxGrossExposureNotional,
    trade_frequency_per_hour: tradeFrequencyPerHour,
    max_trades_per_hour: policy.max_trades_per_hour,
    seconds_since_last_trade: body.seconds_since_last_trade ?? null,
    min_trade_interval_seconds: policy.min_trade_interval_seconds,
    kill_switch_active: policy.kill_switch_active,
    violations,
  });
}
