import type { Json, Database } from "@/lib/supabase/database";
import { runHistoricalBacktest } from "@/lib/validation/historical-backtest";
import { reviewBacktestRisk } from "@/lib/validation/risk-gate";
import type { StrategyTemplate } from "@/lib/validation/signals";
import { createServiceClient } from "@/lib/supabase/service";
import { runPaperValidation } from "@/workers/validation/paper-runner";
import type { SupabaseClient } from "@supabase/supabase-js";

type WorkerClient = SupabaseClient<Database>;

function recordFromJson(value: Json, name: string): Record<string, Json | undefined> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function numberValue(record: Record<string, Json | undefined>, name: string) {
  const value = record[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function templateValue(record: Record<string, Json | undefined>): StrategyTemplate {
  const value = record.template;
  if (value !== "momentum" && value !== "mean-reversion" && value !== "breakout") {
    throw new Error("Strategy template is not supported");
  }
  return value;
}

export async function processNextValidationRun(client: WorkerClient = createServiceClient()) {
  const { data: claimedRuns, error: claimError } = await client.rpc("claim_next_validation_run", {});
  if (claimError) throw new Error(`Unable to claim validation run: ${claimError.message}`);

  const run = claimedRuns[0];
  if (!run) return null;

  try {
    const [{ data: strategy, error: strategyError }, { data: riskPolicy, error: riskError }] = await Promise.all([
      client.from("strategies").select("config").eq("id", run.strategy_id).single(),
      client.from("risk_policies").select("max_leverage, max_position_notional, max_drawdown_pct").eq("workspace_id", run.workspace_id).single(),
    ]);
    if (strategyError || !strategy) throw new Error("Unable to load claimed strategy");
    if (riskError || !riskPolicy) throw new Error("Unable to load workspace risk policy");

    const parameters = recordFromJson(run.parameters, "Run parameters");
    const config = recordFromJson(strategy.config, "Strategy config");
    if (run.run_type === "paper") {
      const result = await runPaperValidation({
        symbol: String(parameters.symbol),
        interval: String(parameters.interval),
        durationMs: numberValue(parameters, "durationMs"),
        initialEquity: numberValue(parameters, "initialEquity"),
        feeRateBps: numberValue(parameters, "feeRateBps"),
        slippageBps: numberValue(parameters, "slippageBps"),
        maxLeverage: riskPolicy.max_leverage,
        maxPositionNotional: riskPolicy.max_position_notional,
        template: templateValue(config),
      });
      const riskReview = reviewBacktestRisk(result.metrics, {
        maxDrawdownPct: riskPolicy.max_drawdown_pct,
      });
      const completedResult = { ...result, riskReview };
      const { error: completionError } = await client.rpc("complete_validation_run", {
        run_id: run.id,
        run_results: completedResult as unknown as Json,
      });
      if (completionError) throw new Error(`Unable to complete validation run: ${completionError.message}`);
      return { runId: run.id, status: "completed" as const, result: completedResult };
    }

    const result = await runHistoricalBacktest({
      symbol: String(parameters.symbol),
      interval: String(parameters.interval),
      startTime: numberValue(parameters, "startTime"),
      endTime: numberValue(parameters, "endTime"),
      initialEquity: numberValue(parameters, "initialEquity"),
      feeRateBps: numberValue(parameters, "feeRateBps"),
      slippageBps: numberValue(parameters, "slippageBps"),
      maxLeverage: riskPolicy.max_leverage,
      maxPositionNotional: riskPolicy.max_position_notional,
      template: templateValue(config),
    });
    const riskReview = reviewBacktestRisk(result.metrics, {
      maxDrawdownPct: riskPolicy.max_drawdown_pct,
    });

    const { error: completionError } = await client.rpc("complete_validation_run", {
      run_id: run.id,
      run_results: { ...result, riskReview } as unknown as Json,
    });
    if (completionError) throw new Error(`Unable to complete validation run: ${completionError.message}`);
    return { runId: run.id, status: "completed" as const, result: { ...result, riskReview } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation worker failed";
    const { error: failureError } = await client.rpc("fail_validation_run", {
      run_id: run.id,
      failure_message: message,
    });
    if (failureError) throw new Error(`Unable to record validation failure: ${failureError.message}`);
    return { runId: run.id, status: "failed" as const, error: message };
  }
}
