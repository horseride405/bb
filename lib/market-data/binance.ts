export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};
export type FundingRate = {
  fundingTime: number;
  fundingRate: number;
};

export type BinanceMarket = {
  symbol: string;
  pair: string;
  status: string;
  contractType: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQuantity: number;
  minNotional: number;
};

export const supportedIntervals = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
export const intervalDurationMs: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};
const defaultBaseUrl = "https://fapi.binance.com";
export const maxHistoricalRangeMs = 90 * 24 * 60 * 60 * 1000;
const marketCatalogCacheMs = 60_000;
let marketCatalogCache: { expiresAt: number; markets: BinanceMarket[] } | undefined;

export type CandleQuery = {
  startTime?: number;
  endTime?: number;
};

function baseUrl() {
  return process.env.BINANCE_FUTURES_API_BASE_URL?.replace(/\/$/, "") ?? defaultBaseUrl;
}

function decimalValue(value: unknown, field: string) {
  if (typeof value !== "string" || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`Binance returned an invalid ${field}`);
  }
  return Number(value);
}

function numberValue(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Binance returned an invalid ${field}`);
  }
  return value;
}

export async function fetchBinanceMarkets(): Promise<BinanceMarket[]> {
  if (marketCatalogCache && marketCatalogCache.expiresAt > Date.now()) {
    return marketCatalogCache.markets;
  }

  const url = new URL("/fapi/v1/exchangeInfo", baseUrl());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Binance market-catalog request failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Binance returned an invalid market catalog");
    }
    const catalog = payload as Record<string, unknown>;
    if (!Array.isArray(catalog.symbols)) {
      throw new Error("Binance returned an invalid market catalog");
    }

    const markets = catalog.symbols.map((entry: unknown) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        Array.isArray(entry)
      ) {
        throw new Error("Binance returned an invalid market entry");
      }
      const market = entry as Record<string, unknown>;
      if (
        typeof market.symbol !== "string" ||
        typeof market.pair !== "string" ||
        typeof market.status !== "string" ||
        typeof market.contractType !== "string" ||
        typeof market.baseAsset !== "string" ||
        typeof market.quoteAsset !== "string" ||
        typeof market.marginAsset !== "string" ||
        !Array.isArray(market.filters)
      ) {
        throw new Error("Binance returned an invalid market entry");
      }

      const priceFilter = market.filters.find(
        (filter: unknown) =>
          typeof filter === "object" &&
          filter !== null &&
          !Array.isArray(filter) &&
          (filter as Record<string, unknown>).filterType === "PRICE_FILTER",
      );
      const lotSizeFilter = market.filters.find(
        (filter: unknown) =>
          typeof filter === "object" &&
          filter !== null &&
          !Array.isArray(filter) &&
          (filter as Record<string, unknown>).filterType === "LOT_SIZE",
      );
      const notionalFilter = market.filters.find(
        (filter: unknown) =>
          typeof filter === "object" &&
          filter !== null &&
          !Array.isArray(filter) &&
          ((filter as Record<string, unknown>).filterType === "MIN_NOTIONAL" ||
            (filter as Record<string, unknown>).filterType === "NOTIONAL"),
      );

      if (
        typeof priceFilter !== "object" ||
        priceFilter === null ||
        Array.isArray(priceFilter) ||
        typeof lotSizeFilter !== "object" ||
        lotSizeFilter === null ||
        Array.isArray(lotSizeFilter)
      ) {
        throw new Error("Binance returned incomplete market filters");
      }

      return {
        symbol: market.symbol,
        pair: market.pair,
        status: market.status,
        contractType: market.contractType,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        marginAsset: market.marginAsset,
        pricePrecision: numberValue(market.pricePrecision, "price precision"),
        quantityPrecision: numberValue(market.quantityPrecision, "quantity precision"),
        tickSize: decimalValue((priceFilter as Record<string, unknown>).tickSize, "tick size"),
        stepSize: decimalValue((lotSizeFilter as Record<string, unknown>).stepSize, "step size"),
        minQuantity: decimalValue((lotSizeFilter as Record<string, unknown>).minQty, "minimum quantity"),
        minNotional:
          typeof notionalFilter === "object" &&
          notionalFilter !== null &&
          !Array.isArray(notionalFilter) &&
          typeof (notionalFilter as Record<string, unknown>).notional === "string"
            ? decimalValue((notionalFilter as Record<string, unknown>).notional, "minimum notional")
            : 0,
      };
    });

    marketCatalogCache = { expiresAt: Date.now() + marketCatalogCacheMs, markets };
    return markets;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeBinanceSymbol(symbol: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9_]{5,30}$/.test(normalizedSymbol)) {
    throw new Error("Invalid Binance Futures symbol");
  }
  return normalizedSymbol;
}

export async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  limit: number,
  query: CandleQuery = {},
): Promise<Candle[]> {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  if (!supportedIntervals.has(interval)) {
    throw new Error("Unsupported candle interval");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1500) {
    throw new Error("Candle limit must be between 1 and 1500");
  }
  if ((query.startTime === undefined) !== (query.endTime === undefined)) {
    throw new Error("Historical candles require both startTime and endTime");
  }
  if (query.startTime !== undefined && query.endTime !== undefined) {
    if (
      !Number.isInteger(query.startTime) ||
      !Number.isInteger(query.endTime) ||
      query.startTime < 0 ||
      query.endTime <= query.startTime
    ) {
      throw new Error("Historical candle timestamps are invalid");
    }
    if (query.endTime - query.startTime > maxHistoricalRangeMs) {
      throw new Error("Historical candle range cannot exceed 90 days");
    }
  }

  const url = new URL("/fapi/v1/klines", baseUrl());
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
  if (query.startTime !== undefined && query.endTime !== undefined) {
    url.searchParams.set("startTime", String(query.startTime));
    url.searchParams.set("endTime", String(query.endTime));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Binance market-data request failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Binance returned an invalid candle payload");
    }

    return payload.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length < 7 ||
        typeof row[0] !== "number" ||
        typeof row[6] !== "number" ||
        typeof row[1] !== "string" ||
        typeof row[2] !== "string" ||
        typeof row[3] !== "string" ||
        typeof row[4] !== "string" ||
        typeof row[5] !== "string"
      ) {
        throw new Error("Binance returned an invalid candle row");
      }

      return {
        openTime: row[0],
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: row[6],
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBinanceCandleRange(
  symbol: string,
  interval: string,
  query: { startTime: number; endTime: number },
): Promise<Candle[]> {
  if (!Number.isInteger(query.startTime) || !Number.isInteger(query.endTime)) {
    throw new Error("Historical candle timestamps are invalid");
  }
  const durationMs = intervalDurationMs[interval];
  if (!durationMs) throw new Error("Unsupported candle interval");

  const candles: Candle[] = [];
  let nextStartTime = query.startTime;
  let exhausted = false;
  for (let page = 0; page < 1_000 && nextStartTime < query.endTime; page += 1) {
    const batch = await fetchBinanceCandles(symbol, interval, 1_500, {
      startTime: nextStartTime,
      endTime: query.endTime,
    });
    const filtered = batch.filter(
      (candle) => candle.openTime >= query.startTime && candle.openTime < query.endTime,
    );
    if (filtered.length === 0) {
      exhausted = true;
      break;
    }

    const lastCandle = filtered.at(-1);
    if (!lastCandle || lastCandle.openTime < nextStartTime) {
      throw new Error("Binance historical pagination made no progress");
    }
    candles.push(...filtered.filter((candle) => candles.at(-1)?.openTime !== candle.openTime));
    nextStartTime = lastCandle.openTime + durationMs;
    if (batch.length < 1_500) {
      exhausted = true;
      break;
    }
  }

  if (!exhausted && nextStartTime < query.endTime) {
    throw new Error("Binance historical pagination exceeded its safety limit");
  }
  return candles;
}

export async function fetchBinanceFundingRates(
  symbol: string,
  query: { startTime: number; endTime: number },
): Promise<FundingRate[]> {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  if (
    !Number.isInteger(query.startTime) ||
    !Number.isInteger(query.endTime) ||
    query.startTime < 0 ||
    query.endTime <= query.startTime ||
    query.endTime - query.startTime > maxHistoricalRangeMs
  ) {
    throw new Error("Funding-rate range must be a valid range of 90 days or less");
  }

  const rates: FundingRate[] = [];
  let nextStartTime = query.startTime;
  let exhausted = false;
  for (let page = 0; page < 100 && nextStartTime < query.endTime; page += 1) {
    const url = new URL("/fapi/v1/fundingRate", baseUrl());
    url.searchParams.set("symbol", normalizedSymbol);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("startTime", String(nextStartTime));
    url.searchParams.set("endTime", String(query.endTime));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Binance funding-rate request failed with status ${response.status}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Binance returned an invalid funding-rate payload");

      const batch = payload.map((row) => {
        if (
          typeof row !== "object" ||
          row === null ||
          Array.isArray(row) ||
          typeof row.fundingTime !== "number" ||
          typeof row.fundingRate !== "string"
        ) {
          throw new Error("Binance returned an invalid funding-rate row");
        }
        const fundingRate = Number(row.fundingRate);
        if (!Number.isFinite(fundingRate)) throw new Error("Binance returned an invalid funding rate");
        return { fundingTime: row.fundingTime, fundingRate };
      }).filter((rate) => rate.fundingTime >= query.startTime && rate.fundingTime < query.endTime);
      if (batch.length === 0) {
        exhausted = true;
        break;
      }

      const lastRate = batch.at(-1);
      if (!lastRate || lastRate.fundingTime < nextStartTime) {
        throw new Error("Binance funding-rate pagination made no progress");
      }
      rates.push(...batch.filter((rate) => rates.at(-1)?.fundingTime !== rate.fundingTime));
      nextStartTime = lastRate.fundingTime + 1;
      if (payload.length < 1000) {
        exhausted = true;
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!exhausted && nextStartTime < query.endTime) {
    throw new Error("Binance funding-rate pagination exceeded its safety limit");
  }
  return rates;
}
