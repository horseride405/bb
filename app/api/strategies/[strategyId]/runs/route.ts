import { NextResponse } from "next/server";

import { parseValidationParameters } from "@/lib/validation/parameters";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ strategyId: string }>;
};

type RunRequest = {
  run_type?: unknown;
  parameters?: unknown;
};

export async function GET(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const { strategyId } = await context.params;

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("strategy_runs")
    .select("id, strategy_id, run_type, status, parameters, results, error_message, started_at, completed_at, created_at")
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Unable to load validation runs" }, { status: 500 });
  }

  return NextResponse.json({ runs: data });
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const { strategyId } = await context.params;

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: RunRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (body.run_type !== "paper" && body.run_type !== "backtest") {
    return NextResponse.json({ error: "Only paper and backtest runs are supported" }, { status: 400 });
  }

  let parameters;
  try {
    parameters = parseValidationParameters(body.run_type, body.parameters);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid validation parameters";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .select("id, workspace_id, mode")
    .eq("id", strategyId)
    .single();

  if (strategyError || !strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  if (strategy.mode === "live") {
    return NextResponse.json({ error: "Live strategies cannot create validation runs" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("strategy_runs")
    .insert({
      workspace_id: strategy.workspace_id,
      strategy_id: strategy.id,
      requested_by: user.id,
      run_type: body.run_type,
      parameters,
    })
    .select("id, strategy_id, run_type, status, parameters, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Unable to queue validation run" }, { status: 500 });
  }

  return NextResponse.json({ run: data }, { status: 202 });
}
