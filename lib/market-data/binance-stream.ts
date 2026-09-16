import type { Candle } from "@/lib/market-data/binance";
import { supportedIntervals } from "@/lib/market-data/binance";

const defaultWebSocketBaseUrl = "wss://fstream.binance.com";

type BinanceKlineMessage = {
  k?: {
    t?: unknown;
    T?: unknown;
    o?: unknown;
    c?: unknown;
    h?: unknown;
    l?: unknown;
    v?: unknown;
    x?: unknown;
  };
};

type SocketFactory = (url: string) => WebSocket;

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function connectBinanceClosedCandleStream(
  symbol: string,
  interval: string,
  onCandle: (candle: Candle) => void,
  onError?: (error: Error) => void,
  socketFactory: SocketFactory = (url) => new WebSocket(url),
): () => void {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(normalizedSymbol)) {
    throw new Error("Invalid Binance Futures symbol");
  }
  if (!supportedIntervals.has(interval)) {
    throw new Error("Unsupported candle interval");
  }

  const baseUrl = process.env.BINANCE_FUTURES_WS_BASE_URL?.replace(/\/$/, "") ?? defaultWebSocketBaseUrl;
  const socket = socketFactory(`${baseUrl}/ws/${normalizedSymbol.toLowerCase()}@kline_${interval}`);
  let closed = false;

  socket.addEventListener("message", (event) => {
    if (closed) return;
    try {
      const payload = JSON.parse(String(event.data)) as BinanceKlineMessage;
      const kline = payload.k;
      if (!kline || kline.x !== true) return;

      const openTime = numberValue(kline.t);
      const closeTime = numberValue(kline.T);
      const open = numberValue(kline.o);
      const close = numberValue(kline.c);
      const high = numberValue(kline.h);
      const low = numberValue(kline.l);
      const volume = numberValue(kline.v);
      if ([openTime, closeTime, open, close, high, low, volume].some((value) => value === null)) {
        throw new Error("Binance returned an invalid closed candle");
      }
      if (
        openTime === null ||
        closeTime === null ||
        open === null ||
        close === null ||
        high === null ||
        low === null ||
        volume === null
      ) {
        throw new Error("Binance returned an invalid closed candle");
      }

      onCandle({ openTime, closeTime, open, close, high, low, volume });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Invalid Binance stream message"));
    }
  });

  socket.addEventListener("error", () => {
    onError?.(new Error("Binance Futures WebSocket error"));
  });

  return () => {
    closed = true;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  };
}
