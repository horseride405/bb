import type { Json } from "@/lib/supabase/database";
import { maxHistoricalRangeMs, supportedIntervals } from "@/lib/market-data/binance";

const symbolPattern = /^[A-Z0-9]{5,20}$/;

export type ValidationParameters = {
  symbol: string;
  interval: string;
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  durationMs?: number;
  startTime?: number;
  endTime?: number;
};

function numberField(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function timestampField(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative integer timestamp`);
  }
  return value as number;
}

export function parseValidationParameters(runType: "paper" | "backtest", input: unknown): Json {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Run parameters must be an object");
  }

  const record = input as Record<string, unknown>;
  const symbol = typeof record.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
  const interval = typeof record.interval === "string" ? record.interval : "";

  if (!symbolPattern.test(symbol)) throw new Error("A valid Binance Futures symbol is required");
  if (!supportedIntervals.has(interval)) throw new Error("A supported candle interval is required");

  const parameters: ValidationParameters = {
    symbol,
    interval,
    initialEquity: numberField(record.initialEquity, "initialEquity", 1, 1_000_000_000),
    feeRateBps: numberField(record.feeRateBps ?? 4, "feeRateBps", 0, 1_000),
    slippageBps: numberField(record.slippageBps ?? 2, "slippageBps", 0, 1_000),
  };

  if (runType === "backtest") {
    const startTime = timestampField(record.startTime, "startTime");
    const endTime = timestampField(record.endTime, "endTime");
    if (endTime <= startTime) throw new Error("endTime must be after startTime");
    if (endTime - startTime > maxHistoricalRangeMs) {
      throw new Error("Backtest range cannot exceed 90 days");
    }
    parameters.startTime = startTime;
    parameters.endTime = endTime;
  } else {
    parameters.durationMs = numberField(record.durationMs ?? 60_000, "durationMs", 1_000, 24 * 60 * 60 * 1_000);
  }

  return parameters as unknown as Json;
}
