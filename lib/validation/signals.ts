import type { Candle } from "@/lib/market-data/binance";
import type { BacktestSignal } from "@/lib/validation/backtest";

export type StrategyTemplate = "momentum" | "mean-reversion" | "breakout";
export type PositionMode = "bidirectional" | "long-only" | "short-only";

export type CustomValue =
  | { type: "price" }
  | { type: "volume" }
  | { type: "sma"; period: number }
  | { type: "ema"; period: number }
  | { type: "rsi"; period: number };

export type CustomCondition = {
  left: CustomValue;
  operator: "greater_than" | "less_than" | "crosses_above" | "crosses_below";
  right: CustomValue | number;
};

export type CustomStrategyConfig = {
  positionMode: PositionMode;
  conditionMode: "all" | "any";
  longEntry: CustomCondition[];
  shortEntry: CustomCondition[];
  longExit: CustomCondition[];
  shortExit: CustomCondition[];
};

export type SignalOptions = {
  positionMode?: PositionMode;
  fastPeriod?: number;
  slowPeriod?: number;
  lookbackPeriod?: number;
  deviationMultiplier?: number;
};

function validateValue(value: unknown): value is CustomValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "price" || record.type === "volume") return true;
  return (
    (record.type === "sma" || record.type === "ema" || record.type === "rsi") &&
    Number.isInteger(record.period) &&
    (record.period as number) >= 2 &&
    (record.period as number) <= 500
  );
}

function validateCondition(value: unknown): value is CustomCondition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    validateValue(record.left) &&
    (record.operator === "greater_than" ||
      record.operator === "less_than" ||
      record.operator === "crosses_above" ||
      record.operator === "crosses_below") &&
    (typeof record.right === "number" ? Number.isFinite(record.right) : validateValue(record.right))
  );
}

export function parseCustomStrategyConfig(value: unknown): CustomStrategyConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Custom strategy configuration must be an object");
  }
  const record = value as Record<string, unknown>;
  const positionMode = record.positionMode ?? "bidirectional";
  const conditionMode = record.conditionMode ?? "all";
  if (
    (positionMode !== "bidirectional" && positionMode !== "long-only" && positionMode !== "short-only") ||
    (conditionMode !== "all" && conditionMode !== "any")
  ) {
    throw new Error("Custom strategy modes are invalid");
  }
  const conditions = (name: string) => {
    const input = record[name];
    if (!Array.isArray(input) || input.length > 10 || !input.every(validateCondition)) {
      throw new Error(`${name} must contain up to 10 valid conditions`);
    }
    return input as CustomCondition[];
  };
  return {
    positionMode,
    conditionMode,
    longEntry: conditions("longEntry"),
    shortEntry: conditions("shortEntry"),
    longExit: conditions("longExit"),
    shortExit: conditions("shortExit"),
  };
}

function valueAt(candles: Candle[], value: CustomValue, index: number) {
  const candle = candles[index];
  if (!candle) return undefined;
  if (value.type === "price") return candle.close;
  if (value.type === "volume") return candle.volume;
  const start = Math.max(0, index - value.period + 1);
  const window = candles.slice(start, index + 1).map((item) => item.close);
  if (window.length < value.period) return undefined;
  if (value.type === "sma") return recentAverage(window, value.period);
  if (value.type === "ema") {
    const multiplier = 2 / (value.period + 1);
    return window.reduce((average, price, position) => position === 0 ? price : price * multiplier + average * (1 - multiplier), window[0] ?? 0);
  }
  const changes = window.slice(1).map((price, position) => price - (window[position] ?? price));
  const gains = changes.map((change) => Math.max(change, 0));
  const losses = changes.map((change) => Math.max(-change, 0));
  const averageGain = gains.reduce((total, gain) => total + gain, 0) / value.period;
  const averageLoss = losses.reduce((total, loss) => total + loss, 0) / value.period;
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function conditionMatches(candles: Candle[], condition: CustomCondition, index: number) {
  const currentLeft = valueAt(candles, condition.left, index);
  const previousLeft = index > 0 ? valueAt(candles, condition.left, index - 1) : undefined;
  const currentRight = typeof condition.right === "number" ? condition.right : valueAt(candles, condition.right, index);
  const previousRight = typeof condition.right === "number" ? condition.right : index > 0 ? valueAt(candles, condition.right, index - 1) : undefined;
  if (currentLeft === undefined || previousLeft === undefined || currentRight === undefined || previousRight === undefined) return false;
  if (condition.operator === "greater_than") return currentLeft > currentRight;
  if (condition.operator === "less_than") return currentLeft < currentRight;
  if (condition.operator === "crosses_above") return previousLeft <= previousRight && currentLeft > currentRight;
  return previousLeft >= previousRight && currentLeft < currentRight;
}

export function createCustomStrategySignal(config: CustomStrategyConfig): (candle: Candle, index: number) => BacktestSignal {
  const candles: Candle[] = [];
  const matches = (conditions: CustomCondition[], index: number) => {
    if (conditions.length === 0) return false;
    const results = conditions.map((condition) => conditionMatches(candles, condition, index));
    return config.conditionMode === "all" ? results.every(Boolean) : results.some(Boolean);
  };
  let position: BacktestSignal = "flat";
  return (candle, index) => {
    candles.push(candle);
    let signal: BacktestSignal = position;
    if (position === "long" && matches(config.longExit, index)) signal = "flat";
    if (position === "short" && matches(config.shortExit, index)) signal = "flat";
    if (position === "flat") {
      if (config.positionMode !== "short-only" && matches(config.longEntry, index)) signal = "long";
      if (config.positionMode !== "long-only" && matches(config.shortEntry, index)) signal = "short";
    }
    position = signal;
    return signal;
  };
}

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
  const positionMode = options.positionMode ?? "bidirectional";

  if (!Number.isFinite(deviationMultiplier) || deviationMultiplier <= 0) {
    throw new Error("Signal deviation multiplier must be positive");
  }
  if (!["bidirectional", "long-only", "short-only"].includes(positionMode)) {
    throw new Error("Signal position mode is not supported");
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

    if (positionMode === "long-only" && signal === "short") signal = "flat";
    if (positionMode === "short-only" && signal === "long") signal = "flat";
    closes.push(candle.close);
    highs.push(candle.high);
    lows.push(candle.low);
    positionSide = signal;
    return signal;
  };
}
