import type { Candle } from "@/lib/market-data/binance";
import { connectBinanceClosedCandleStream } from "@/lib/market-data/binance-stream";
import { createPaperTradingEngine, type PaperTradingSnapshot } from "@/lib/validation/paper-trading";

type PaperTradingEngine = ReturnType<typeof createPaperTradingEngine>;

export type PaperStreamConnector = (
  symbol: string,
  interval: string,
  onCandle: (candle: Candle) => void,
  onError: (error: Error) => void,
) => () => void;

export type PaperSessionOptions = {
  symbol: string;
  interval: string;
  engine: PaperTradingEngine;
  onSnapshot: (snapshot: PaperTradingSnapshot) => void;
  onError?: (error: Error) => void;
  connect?: PaperStreamConnector;
};

export function startPaperTradingSession(options: PaperSessionOptions) {
  let stopped = false;
  let cleanup: (() => void) | undefined;

  const stopWithError = (error: Error) => {
    if (stopped) return;
    stopped = true;
    cleanup?.();
    options.onError?.(error);
  };

  const onCandle = (candle: Candle) => {
    if (stopped) return;
    try {
      options.onSnapshot(options.engine.processCandle(candle));
    } catch (error) {
      stopWithError(error instanceof Error ? error : new Error("Paper session failed"));
    }
  };

  cleanup = (options.connect ?? connectBinanceClosedCandleStream)(
    options.symbol,
    options.interval,
    onCandle,
    stopWithError,
  );

  return () => {
    if (stopped) return;
    stopped = true;
    cleanup?.();
    const finalSnapshot = options.engine.finish();
    if (finalSnapshot) options.onSnapshot(finalSnapshot);
  };
}
