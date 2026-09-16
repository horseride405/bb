import {
  fetchBinanceCandleRange,
  fetchBinanceFundingRates,
  maxHistoricalRangeMs,
  type Candle,
  type FundingRate,
} from "@/lib/market-data/binance";
import { runBacktest, type BacktestResult } from "@/lib/validation/backtest";
import { calculateValidationMetrics, type ValidationMetrics } from "@/lib/validation/metrics";
import { createTemplateSignal, type SignalOptions, type StrategyTemplate } from "@/lib/validation/signals";
import type { TrailingExitOptions } from "@/lib/validation/trailing-exits";

export type HistoricalBacktestRequest = TrailingExitOptions & {
  symbol: string;
  interval: string;
  startTime: number;
  endTime: number;
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  outOfSamplePct?: number;
  maxLeverage: number;
  maxPositionNotional?: number;
  maintenanceMarginRate?: number;
  minLiquidationDistancePct?: number;
  template: StrategyTemplate;
  signalOptions?: SignalOptions;
  fundingRates?: FundingRate[];
};

export type HistoricalBacktestResult = BacktestResult & {
  version: 1;
  source: "binance-futures-public";
  symbol: string;
  interval: string;
  template: StrategyTemplate;
  candleCount: number;
  firstCandleOpenTime: number | null;
  lastCandleCloseTime: number | null;
  fundingRateCount: number;
  walkForward: {
    outOfSamplePct: number;
    inSampleCandleCount: number;
    outOfSampleCandleCount: number;
    outOfSampleStartTime: number;
    metrics: ValidationMetrics;
  };
};

type CandleFetcher = (
  symbol: string,
  interval: string,
  query: { startTime: number; endTime: number },
) => Promise<Candle[]>;
type FundingFetcher = (
  symbol: string,
  query: { startTime: number; endTime: number },
) => Promise<FundingRate[]>;

function validateWindow(startTime: number, endTime: number) {
  if (
    !Number.isInteger(startTime) ||
    !Number.isInteger(endTime) ||
    startTime < 0 ||
    endTime <= startTime ||
    endTime - startTime > maxHistoricalRangeMs
  ) {
    throw new Error("Historical backtest window must be a valid range of 90 days or less");
  }
}

export async function runHistoricalBacktest(
  request: HistoricalBacktestRequest,
  fetchCandles: CandleFetcher = fetchBinanceCandleRange,
  fetchFundingRates: FundingFetcher = fetchBinanceFundingRates,
): Promise<HistoricalBacktestResult> {
  validateWindow(request.startTime, request.endTime);
  const [candles, fundingRates] = await Promise.all([
    fetchCandles(request.symbol, request.interval, {
      startTime: request.startTime,
      endTime: request.endTime,
    }),
    request.fundingRates
      ? Promise.resolve(request.fundingRates)
      : fetchFundingRates(request.symbol, { startTime: request.startTime, endTime: request.endTime }),
  ]);
  if (candles.length === 0) {
    throw new Error("Historical backtest returned no candles");
  }

  const result = runBacktest(candles, {
    initialEquity: request.initialEquity,
    feeRateBps: request.feeRateBps,
    slippageBps: request.slippageBps,
    maxLeverage: request.maxLeverage,
    maxPositionNotional: request.maxPositionNotional,
    maintenanceMarginRate: request.maintenanceMarginRate,
    minLiquidationDistancePct: request.minLiquidationDistancePct,
    trailingStopLossPct: request.trailingStopLossPct,
    trailingTakeProfitPct: request.trailingTakeProfitPct,
    trailingTakeProfitActivationPct: request.trailingTakeProfitActivationPct,
    fundingRates,
    signal: createTemplateSignal(request.template, request.signalOptions),
  });
  const outOfSamplePct = request.outOfSamplePct ?? 30;
  if (!Number.isFinite(outOfSamplePct) || outOfSamplePct < 10 || outOfSamplePct > 50) {
    throw new Error("Out-of-sample percentage must be between 10 and 50");
  }
  const splitIndex = Math.min(
    candles.length - 1,
    Math.max(1, Math.floor(candles.length * (1 - outOfSamplePct / 100))),
  );
  const outOfSampleStart = candles[splitIndex];
  const outOfSampleInitialEquity = result.equityCurve[splitIndex - 1] ?? request.initialEquity;
  const outOfSampleTrades = result.trades.filter(
    (trade) => trade.entryTime >= outOfSampleStart.openTime,
  );
  const outOfSampleMetrics = calculateValidationMetrics(
    outOfSampleInitialEquity,
    result.equityCurve.slice(splitIndex - 1),
    outOfSampleTrades,
  );

  return {
    ...result,
    version: 1,
    source: "binance-futures-public",
    symbol: request.symbol,
    interval: request.interval,
    template: request.template,
    candleCount: candles.length,
    firstCandleOpenTime: candles[0]?.openTime ?? null,
    lastCandleCloseTime: candles.at(-1)?.closeTime ?? null,
    fundingRateCount: fundingRates.length,
    walkForward: {
      outOfSamplePct,
      inSampleCandleCount: splitIndex,
      outOfSampleCandleCount: candles.length - splitIndex,
      outOfSampleStartTime: outOfSampleStart.openTime,
      metrics: outOfSampleMetrics,
    },
  };
}
