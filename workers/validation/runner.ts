import type { Json, Database } from "@/lib/supabase/database";
import { runHistoricalBacktest } from "@/lib/validation/historical-backtest";
import { reviewBacktestRisk } from "@/lib/validation/risk-gate";
import type { PositionMode, StrategyTemplate } from "@/lib/validation/signals";
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

function positionModeValue(record: Record<string, Json | undefined>): PositionMode {
  const value = record.positionMode;
  if (value === undefined) return "bidirectional";
  if (value !== "bidirectional" && value !== "long-only" && value !== "short-only") {
    throw new Error("Strategy position mode is not supported");
  }
  return value;
}

function optionalPercentValue(record: Record<string, Json | undefined>, name: string) {
  const value = record[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) {
    throw new Error(`${name} must be between 0 and 100`);
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
      client.from("risk_policies").select("max_leverage, max_position_notional, max_daily_loss_pct, max_drawdown_pct, max_trades_per_hour, min_trade_interval_seconds, min_liquidation_distance_pct, kill_switch_active").eq("workspace_id", run.workspace_id).single(),
    ]);
    if (strategyError || !strategy) throw new Error("Unable to load claimed strategy");
    if (riskError || !riskPolicy) throw new Error("Unable to load workspace risk policy");
    if (riskPolicy.kill_switch_active) throw new Error("Validation blocked by workspace kill switch");

    const parameters = recordFromJson(run.parameters, "Run parameters");
    const config = recordFromJson(strategy.config, "Strategy config");
    const signalOptions = { positionMode: positionModeValue(config) };
    const trailingOptions = {
      trailingStopLossPct: optionalPercentValue(config, "trailingStopLossPct"),
      trailingTakeProfitPct: optionalPercentValue(config, "trailingTakeProfitPct"),
      trailingTakeProfitActivationPct: optionalPercentValue(config, "trailingTakeProfitActivationPct"),
    };
    const validationConfig = {
      template: templateValue(config),
      positionMode: signalOptions.positionMode,
      trailingStopLossPct: trailingOptions.trailingStopLossPct ?? null,
      trailingTakeProfitPct: trailingOptions.trailingTakeProfitPct ?? null,
      trailingTakeProfitActivationPct: trailingOptions.trailingTakeProfitActivationPct ?? null,
      maxLeverage: riskPolicy.max_leverage,
      maxPositionNotional: riskPolicy.max_position_notional,
      minLiquidationDistancePct: riskPolicy.min_liquidation_distance_pct,
      maxTradesPerHour: riskPolicy.max_trades_per_hour,
      minTradeIntervalSeconds: riskPolicy.min_trade_interval_seconds,
    };
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
        minLiquidationDistancePct: riskPolicy.min_liquidation_distance_pct,
        ...trailingOptions,
        template: templateValue(config),
        signalOptions,
      });
      const riskReview = reviewBacktestRisk(result.metrics, {
        maxDailyLossPct: riskPolicy.max_daily_loss_pct,
        maxDrawdownPct: riskPolicy.max_drawdown_pct,
        maxTradesPerHour: riskPolicy.max_trades_per_hour,
        minTradeIntervalSeconds: riskPolicy.min_trade_interval_seconds,
      }, {
        initialEquity: numberValue(parameters, "initialEquity"),
        curve: result.equityCurve,
        times: result.equityCurveTimes,
      }, numberValue(parameters, "durationMs"), result.trades);
      const completedResult = { ...result, validationConfig, riskReview };
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
      outOfSamplePct:
        parameters.outOfSamplePct === undefined ? 30 : numberValue(parameters, "outOfSamplePct"),
      maxLeverage: riskPolicy.max_leverage,
      maxPositionNotional: riskPolicy.max_position_notional,
      minLiquidationDistancePct: riskPolicy.min_liquidation_distance_pct,
      ...trailingOptions,
      template: templateValue(config),
      signalOptions,
    });
    const riskReview = reviewBacktestRisk(result.metrics, {
      maxDailyLossPct: riskPolicy.max_daily_loss_pct,
      maxDrawdownPct: riskPolicy.max_drawdown_pct,
      maxTradesPerHour: riskPolicy.max_trades_per_hour,
      minTradeIntervalSeconds: riskPolicy.min_trade_interval_seconds,
    }, {
      initialEquity: numberValue(parameters, "initialEquity"),
        curve: result.equityCurve,
        times: result.equityCurveTimes,
      }, numberValue(parameters, "endTime") - numberValue(parameters, "startTime"), result.trades);

    const { error: completionError } = await client.rpc("complete_validation_run", {
      run_id: run.id,
      run_results: { ...result, validationConfig, riskReview } as unknown as Json,
    });
    if (completionError) throw new Error(`Unable to complete validation run: ${completionError.message}`);
    return { runId: run.id, status: "completed" as const, result: { ...result, validationConfig, riskReview } };
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
