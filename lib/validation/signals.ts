import type { Candle } from "@/lib/market-data/binance";
import type { BacktestSignal } from "@/lib/validation/backtest";

export type StrategyTemplate = "momentum" | "mean-reversion" | "breakout";

export type SignalOptions = {
  fastPeriod?: number;
  slowPeriod?: number;
  lookbackPeriod?: number;
  deviationMultiplier?: number;
};

function recentAverage(values: number[], period: number) {
  const window = values.slice(-period);
  return window.reduce((total, value) => total + value, 0) / window.length;
}

function recentStandardDeviation(values: number[], period: number, mean: number) {
  const window = values.slice(-period);
  const variance = window.reduce((total, value) => total + (value - mean) ** 2, 0) / window.length;
  return Math.sqrt(variance);
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

export function createTemplateSignal(
  template: StrategyTemplate,
  options: SignalOptions = {},
): (candle: Candle, index: number) => BacktestSignal {
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  let positionSide: BacktestSignal = "flat";
  const fastPeriod = positiveInteger(options.fastPeriod, 5);
  const slowPeriod = Math.max(fastPeriod + 1, positiveInteger(options.slowPeriod, 20));
  const lookbackPeriod = positiveInteger(options.lookbackPeriod, 20);
  const deviationMultiplier = options.deviationMultiplier ?? 2;

  if (!Number.isFinite(deviationMultiplier) || deviationMultiplier <= 0) {
    throw new Error("Signal deviation multiplier must be positive");
  }

  return (candle) => {
    let signal: BacktestSignal = "flat";

    if (template === "momentum" && closes.length >= slowPeriod) {
      const fastAverage = recentAverage(closes, fastPeriod);
      const slowAverage = recentAverage(closes, slowPeriod);
      signal = fastAverage > slowAverage ? "long" : fastAverage < slowAverage ? "short" : "flat";
    }

    if (template === "mean-reversion" && closes.length >= lookbackPeriod) {
      const mean = recentAverage(closes, lookbackPeriod);
      const lowerBand = mean - recentStandardDeviation(closes, lookbackPeriod, mean) * deviationMultiplier;
      const upperBand = mean + recentStandardDeviation(closes, lookbackPeriod, mean) * deviationMultiplier;
      signal =
        positionSide === "long"
          ? candle.close >= mean ? "flat" : "long"
          : positionSide === "short"
            ? candle.close <= mean ? "flat" : "short"
            : candle.close <= lowerBand
              ? "long"
              : candle.close >= upperBand
                ? "short"
                : "flat";
    }

    if (template === "breakout" && highs.length >= lookbackPeriod) {
      const resistance = Math.max(...highs.slice(-lookbackPeriod));
      const support = Math.min(...lows.slice(-lookbackPeriod));
      signal =
        positionSide === "long"
          ? candle.close < support ? "flat" : "long"
          : positionSide === "short"
            ? candle.close > resistance ? "flat" : "short"
            : candle.close > resistance
              ? "long"
              : candle.close < support
                ? "short"
                : "flat";
    }

    closes.push(candle.close);
    highs.push(candle.high);
    lows.push(candle.low);
    positionSide = signal;
    return signal;
  };
}
