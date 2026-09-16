import type { Candle } from "@/lib/market-data/binance";
import { calculateValidationMetrics, type TradeOutcome, type ValidationMetrics } from "@/lib/validation/metrics";

export type BacktestSignal = "long" | "flat";

export type BacktestOptions = {
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  maxLeverage: number;
  maxPositionNotional?: number;
  signal: (candle: Candle, index: number) => BacktestSignal;
};

export type BacktestTrade = TradeOutcome & {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
};

export type BacktestResult = {
  equityCurve: number[];
  equityCurveTimes: number[];
  trades: BacktestTrade[];
  metrics: ValidationMetrics;
};

function assertCandles(candles: Candle[]) {
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!candle || !Number.isFinite(candle.close) || candle.close <= 0 || !Number.isFinite(candle.openTime)) {
      throw new Error("Backtest candles must contain positive finite close prices");
    }
    if (index > 0 && candle.openTime <= candles[index - 1].openTime) {
      throw new Error("Backtest candles must be sorted by increasing open time");
    }
  }
}

export function runLongOnlyBacktest(candles: Candle[], options: BacktestOptions): BacktestResult {
  assertCandles(candles);
  if (candles.length === 0) {
    return {
      equityCurve: [options.initialEquity],
      equityCurveTimes: [],
      trades: [],
      metrics: calculateValidationMetrics(options.initialEquity, [], []),
    };
  }
  if (!Number.isFinite(options.initialEquity) || options.initialEquity <= 0) {
    throw new Error("Backtest initial equity must be positive");
  }
  if (!Number.isFinite(options.feeRateBps) || options.feeRateBps < 0) {
    throw new Error("Backtest fee rate must be non-negative");
  }
  if (!Number.isFinite(options.slippageBps) || options.slippageBps < 0) {
    throw new Error("Backtest slippage must be non-negative");
  }
  if (!Number.isFinite(options.maxLeverage) || options.maxLeverage < 1) {
    throw new Error("Backtest leverage must be at least 1");
  }

  const feeRate = options.feeRateBps / 10_000;
  const slippageRate = options.slippageBps / 10_000;
  let cash = options.initialEquity;
  let position:
    | {
        entryPrice: number;
        entryTime: number;
        entryFee: number;
        quantity: number;
      }
    | undefined;
  const equityCurve: number[] = [];
  const equityCurveTimes: number[] = [];
  const trades: BacktestTrade[] = [];

  const closePosition = (candle: Candle) => {
    if (!position) return;
    const exitPrice = candle.close * (1 - slippageRate);
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity;
    const exitFee = exitPrice * position.quantity * feeRate;
    cash += grossPnl - exitFee;
    trades.push({
      pnl: grossPnl - position.entryFee - exitFee,
      fees: position.entryFee + exitFee,
      funding: 0,
      entryTime: position.entryTime,
      exitTime: candle.closeTime,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
    });
    position = undefined;
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const signal = options.signal(candle, index);
    if (signal !== "long" && signal !== "flat") {
      throw new Error("Backtest signal must be long or flat");
    }

    if (position && signal === "flat") closePosition(candle);
    if (!position && signal === "long" && index < candles.length - 1) {
      const availableEquity = Math.max(cash, 0);
      const notional = Math.min(
        availableEquity * options.maxLeverage,
        options.maxPositionNotional ?? Number.POSITIVE_INFINITY,
      );
      const entryPrice = candle.close * (1 + slippageRate);
      const quantity = notional / entryPrice;
      const entryFee = notional * feeRate;
      if (quantity > 0 && entryFee < availableEquity) {
        cash -= entryFee;
        position = { entryPrice, entryTime: candle.closeTime, entryFee, quantity };
      }
    }

    equityCurve.push(
      position ? cash + (candle.close - position.entryPrice) * position.quantity : cash,
    );
    equityCurveTimes.push(candle.closeTime);
  }

  closePosition(candles[candles.length - 1]);
  equityCurve[equityCurve.length - 1] = cash;

  return {
    equityCurve,
    equityCurveTimes,
    trades,
    metrics: calculateValidationMetrics(options.initialEquity, equityCurve, trades),
  };
}
