import type { PaperStreamConnector } from "@/lib/validation/paper-session";
import {
  fetchBinanceFundingRates,
  intervalDurationMs,
  type FundingRate,
} from "@/lib/market-data/binance";
import { startPaperTradingSession } from "@/lib/validation/paper-session";
import { createPaperTradingEngine } from "@/lib/validation/paper-trading";
import { createCustomStrategySignal, createTemplateSignal, type CustomStrategyConfig, type SignalOptions, type StrategyTemplate } from "@/lib/validation/signals";
import type { TrailingExitOptions } from "@/lib/validation/trailing-exits";

export type PaperValidationRequest = TrailingExitOptions & {
  symbol: string;
  interval: string;
  template: StrategyTemplate;
  customStrategy?: CustomStrategyConfig;
  signalOptions?: SignalOptions;
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  maxLeverage: number;
  maxPositionNotional?: number;
  minLiquidationDistancePct?: number;
  fundingRates?: FundingRate[];
  durationMs: number;
  signal?: AbortSignal;
  connect?: PaperStreamConnector;
};

export type PaperValidationResult = {
  version: 1;
  source: "binance-futures-public-stream";
  symbol: string;
  interval: string;
  template: StrategyTemplate;
  durationMs: number;
  observedAt: number;
  equityCurve: number[];
  equityCurveTimes: number[];
  trades: ReturnType<ReturnType<typeof createPaperTradingEngine>["getResult"]>["trades"];
  fundingRateCount: number;
  metrics: ReturnType<ReturnType<typeof createPaperTradingEngine>["getMetrics"]>;
};

function validateDuration(durationMs: number) {
  if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 24 * 60 * 60 * 1_000) {
    throw new Error("Paper validation duration must be between 1 second and 24 hours");
  }
}

export async function runPaperValidation(
  request: PaperValidationRequest,
): Promise<PaperValidationResult> {
  validateDuration(request.durationMs);
  if (request.signal?.aborted) throw new Error("Paper validation was aborted");
  const fundingRates =
    request.fundingRates ??
    (await fetchBinanceFundingRates(request.symbol, {
      startTime: Date.now() - 24 * 60 * 60 * 1_000,
      endTime: Date.now() + request.durationMs,
    }));

  const engine = createPaperTradingEngine({
    initialEquity: request.initialEquity,
    feeRateBps: request.feeRateBps,
    slippageBps: request.slippageBps,
    maxLeverage: request.maxLeverage,
    maxPositionNotional: request.maxPositionNotional,
    minLiquidationDistancePct: request.minLiquidationDistancePct,
    trailingStopLossPct: request.trailingStopLossPct,
    trailingTakeProfitPct: request.trailingTakeProfitPct,
    trailingTakeProfitActivationPct: request.trailingTakeProfitActivationPct,
    fundingRates,
    signal: request.customStrategy
      ? createCustomStrategySignal(request.customStrategy)
      : createTemplateSignal(request.template, request.signalOptions),
  });

  let latestSnapshot: ReturnType<typeof engine.processCandle> | undefined;
  let streamError: Error | undefined;
  let stopSession: (() => void) | undefined;
  let previousCloseTime: number | undefined;

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let onAbort: () => void;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    onAbort = () => settle();
    timer = setTimeout(settle, request.durationMs);

    request.signal?.addEventListener("abort", onAbort, { once: true });
    stopSession = startPaperTradingSession({
      symbol: request.symbol,
      interval: request.interval,
      engine,
      connect: request.connect,
      onSnapshot: (snapshot) => {
        const intervalMs = intervalDurationMs[request.interval];
        if (!intervalMs) throw new Error("Unsupported paper candle interval");
        if (
          previousCloseTime !== undefined &&
          snapshot.candle.closeTime - previousCloseTime > intervalMs * 2
        ) {
          throw new Error("Paper validation detected a stale candle-data gap");
        }
        previousCloseTime = snapshot.candle.closeTime;
        latestSnapshot = snapshot;
      },
      onError: (error) => {
        streamError = error;
        settle();
      },
    });
  });

  stopSession?.();
  if (request.signal?.aborted) throw new Error("Paper validation was aborted");
  if (streamError) throw streamError;
  if (!latestSnapshot) throw new Error("Paper validation ended without a closed candle");
  const engineResult = engine.getResult();

  return {
    version: 1,
    source: "binance-futures-public-stream",
    symbol: request.symbol,
    interval: request.interval,
    template: request.template,
    durationMs: request.durationMs,
    observedAt: latestSnapshot.candle.closeTime,
    ...engineResult,
    metrics: latestSnapshot.metrics,
  };
}
