import { fetchBinanceCandles, maxHistoricalRangeMs, type Candle } from "@/lib/market-data/binance";
import { runBacktest, type BacktestResult } from "@/lib/validation/backtest";
import { createTemplateSignal, type StrategyTemplate } from "@/lib/validation/signals";

export type HistoricalBacktestRequest = {
  symbol: string;
  interval: string;
  startTime: number;
  endTime: number;
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  maxLeverage: number;
  maxPositionNotional?: number;
  template: StrategyTemplate;
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
};

type CandleFetcher = (
  symbol: string,
  interval: string,
  limit: number,
  query: { startTime: number; endTime: number },
) => Promise<Candle[]>;

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
  fetchCandles: CandleFetcher = fetchBinanceCandles,
): Promise<HistoricalBacktestResult> {
  validateWindow(request.startTime, request.endTime);
  const candles = await fetchCandles(request.symbol, request.interval, 1500, {
    startTime: request.startTime,
    endTime: request.endTime,
  });
  if (candles.length === 0) {
    throw new Error("Historical backtest returned no candles");
  }

  const result = runBacktest(candles, {
    initialEquity: request.initialEquity,
    feeRateBps: request.feeRateBps,
    slippageBps: request.slippageBps,
    maxLeverage: request.maxLeverage,
    maxPositionNotional: request.maxPositionNotional,
    signal: createTemplateSignal(request.template),
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
  };
}
