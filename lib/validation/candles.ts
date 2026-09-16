import type { Candle } from "@/lib/market-data/binance";

export function validateCandle(candle: Candle, previousCandle?: Candle) {
  if (
    !Number.isInteger(candle.openTime) ||
    !Number.isInteger(candle.closeTime) ||
    candle.closeTime <= candle.openTime ||
    !Number.isFinite(candle.open) ||
    candle.open <= 0 ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    candle.high < candle.low ||
    candle.low <= 0 ||
    !Number.isFinite(candle.volume) ||
    candle.volume < 0
  ) {
    throw new Error("Candles must contain valid positive OHLC prices and timestamps");
  }
  if (previousCandle && candle.openTime <= previousCandle.openTime) {
    throw new Error("Candles must be sorted by increasing open time");
  }
}
