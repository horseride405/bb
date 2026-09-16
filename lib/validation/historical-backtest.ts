import {
  fetchBinanceCandleRange,
  fetchBinanceFundingRates,
  intervalDurationMs,
  maxHistoricalRangeMs,
  type Candle,
  type FundingRate,
} from "@/lib/market-data/binance";
import { runBacktest, type BacktestResult } from "@/lib/validation/backtest";
import { validateFundingRates } from "@/lib/validation/funding";
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
    folds: Array<{
      index: number;
      startTime: number;
      endTime: number;
      candleCount: number;
      metrics: ValidationMetrics;
    }>;
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
  if (candles.length < 30) {
    throw new Error("Historical backtest requires at least 30 candles");
  }
  validateFundingRates(fundingRates, {
    startTime: request.startTime,
    endTime: request.endTime,
  });
  const expectedIntervalMs = intervalDurationMs[request.interval];
  if (!expectedIntervalMs) {
    throw new Error("Historical backtest interval is not supported");
  }
  for (let index = 1; index < candles.length; index += 1) {
    const previousCandle = candles[index - 1];
    const candle = candles[index];
    if (candle.openTime - previousCandle.openTime > expectedIntervalMs * 2) {
      throw new Error("Historical backtest detected an incomplete candle-data gap");
    }
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
  const foldCount = Math.min(3, candles.length - splitIndex);
  const folds = Array.from({ length: foldCount }, (_, index) => {
    const foldStartIndex = splitIndex + Math.floor(index * (candles.length - splitIndex) / foldCount);
    const foldEndIndex = splitIndex + Math.floor((index + 1) * (candles.length - splitIndex) / foldCount) - 1;
    const foldInitialEquity = result.equityCurve[foldStartIndex - 1] ?? request.initialEquity;
    const foldStart = candles[foldStartIndex];
    const foldEnd = candles[foldEndIndex];
    const foldTrades = result.trades.filter(
      (trade) => trade.entryTime >= foldStart.openTime && trade.exitTime <= foldEnd.closeTime,
    );
    return {
      index: index + 1,
      startTime: foldStart.openTime,
      endTime: foldEnd.closeTime,
      candleCount: foldEndIndex - foldStartIndex + 1,
      metrics: calculateValidationMetrics(
        foldInitialEquity,
        result.equityCurve.slice(foldStartIndex - 1, foldEndIndex + 1),
        foldTrades,
      ),
    };
  });

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
      folds,
    },
  };
}
