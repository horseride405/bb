import type { Candle, FundingRate } from "@/lib/market-data/binance";
import { calculateValidationMetrics, type TradeOutcome, type ValidationMetrics } from "@/lib/validation/metrics";

export type BacktestSignal = "long" | "short" | "flat";

export type BacktestOptions = {
  initialEquity: number;
  feeRateBps: number;
  slippageBps: number;
  maxLeverage: number;
  maxPositionNotional?: number;
  maintenanceMarginRate?: number;
  minLiquidationDistancePct?: number;
  fundingRates?: FundingRate[];
  signal: (candle: Candle, index: number) => BacktestSignal;
};

export type BacktestTrade = TradeOutcome & {
  side: "long" | "short";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  liquidationPrice?: number;
  exitReason: "signal" | "end" | "liquidation";
  liquidated: boolean;
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
    if (
      !candle ||
      !Number.isFinite(candle.close) ||
      candle.close <= 0 ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      candle.high < candle.low ||
      candle.low <= 0 ||
      !Number.isFinite(candle.openTime)
    ) {
      throw new Error("Backtest candles must contain valid positive OHLC prices");
    }
    if (index > 0 && candle.openTime <= candles[index - 1].openTime) {
      throw new Error("Backtest candles must be sorted by increasing open time");
    }
  }
}

export function runBacktest(candles: Candle[], options: BacktestOptions): BacktestResult {
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
  const maintenanceMarginRate = options.maintenanceMarginRate ?? 0.005;
  if (!Number.isFinite(maintenanceMarginRate) || maintenanceMarginRate <= 0 || maintenanceMarginRate >= 1) {
    throw new Error("Backtest maintenance margin rate must be between 0 and 1");
  }
  if (
    options.minLiquidationDistancePct !== undefined &&
    (!Number.isFinite(options.minLiquidationDistancePct) || options.minLiquidationDistancePct <= 0)
  ) {
    throw new Error("Backtest minimum liquidation distance must be positive");
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
        side: "long" | "short";
        fundingCost: number;
        liquidationPrice: number;
        entryIndex: number;
      }
    | undefined;
  const equityCurve: number[] = [];
  const equityCurveTimes: number[] = [];
  const trades: BacktestTrade[] = [];
  let fundingIndex = 0;

  const closePosition = (
    candle: Candle,
    forcedExitPrice?: number,
    exitReason: "signal" | "end" | "liquidation" = "signal",
  ) => {
    if (!position) return;
    const exitPrice =
      forcedExitPrice ??
      candle.close * (position.side === "long" ? 1 - slippageRate : 1 + slippageRate);
    const grossPnl =
      (exitPrice - position.entryPrice) * position.quantity * (position.side === "long" ? 1 : -1);
    const exitFee = exitPrice * position.quantity * feeRate;
    cash += grossPnl - exitFee;
    trades.push({
      pnl: grossPnl - position.entryFee - exitFee - position.fundingCost,
      fees: position.entryFee + exitFee,
      funding: position.fundingCost,
      side: position.side,
      entryTime: position.entryTime,
      exitTime: candle.closeTime,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      liquidationPrice: position.liquidationPrice,
      exitReason,
      liquidated: exitReason === "liquidation",
    });
    position = undefined;
  };

  for (const rate of options.fundingRates ?? []) {
    if (!Number.isInteger(rate.fundingTime) || !Number.isFinite(rate.fundingRate)) {
      throw new Error("Backtest funding rates must contain finite timestamps and rates");
    }
  }
  if ((options.fundingRates ?? []).some((rate, index, rates) => index > 0 && rate.fundingTime <= rates[index - 1].fundingTime)) {
    throw new Error("Backtest funding rates must be sorted by funding time");
  }

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const signal = options.signal(candle, index);
    if (signal !== "long" && signal !== "short" && signal !== "flat") {
      throw new Error("Backtest signal must be long, short, or flat");
    }

    let liquidatedThisCandle = false;
    if (
      position &&
      index > position.entryIndex &&
      ((position.side === "long" && candle.low <= position.liquidationPrice) ||
        (position.side === "short" && candle.high >= position.liquidationPrice))
    ) {
      closePosition(candle, position.liquidationPrice, "liquidation");
      liquidatedThisCandle = true;
    }
    if (!liquidatedThisCandle && position && (signal === "flat" || signal !== position.side)) {
      closePosition(candle);
    }
    if (!liquidatedThisCandle && !position && signal !== "flat" && index < candles.length - 1) {
      const availableEquity = Math.max(cash, 0);
      const notional = Math.min(
        availableEquity * options.maxLeverage,
        options.maxPositionNotional ?? Number.POSITIVE_INFINITY,
      );
      const entryPrice = candle.close * (signal === "long" ? 1 + slippageRate : 1 - slippageRate);
      const liquidationPrice =
        signal === "long"
          ? entryPrice * (1 - 1 / options.maxLeverage + maintenanceMarginRate)
          : entryPrice * (1 + 1 / options.maxLeverage - maintenanceMarginRate);
      const liquidationDistancePct = (Math.abs(entryPrice - liquidationPrice) / entryPrice) * 100;
      if (
        options.minLiquidationDistancePct !== undefined &&
        liquidationDistancePct < options.minLiquidationDistancePct
      ) {
        throw new Error("Backtest liquidation distance is below the workspace policy");
      }
      const quantity = notional / entryPrice;
      const entryFee = notional * feeRate;
      if (quantity > 0 && entryFee < availableEquity) {
        cash -= entryFee;
        position = {
          entryPrice,
          entryTime: candle.closeTime,
          entryFee,
          quantity,
          side: signal,
          fundingCost: 0,
          liquidationPrice,
          entryIndex: index,
        };
      }
    }

    while (fundingIndex < (options.fundingRates ?? []).length) {
      const rate = options.fundingRates?.[fundingIndex];
      if (!rate || rate.fundingTime > candle.closeTime) break;
      if (position && rate.fundingTime >= position.entryTime) {
        const payment = candle.close * position.quantity * rate.fundingRate * (position.side === "long" ? 1 : -1);
        cash -= payment;
        position.fundingCost += payment;
      }
      fundingIndex += 1;
    }

    equityCurve.push(
      position
        ? cash + (candle.close - position.entryPrice) * position.quantity * (position.side === "long" ? 1 : -1)
        : cash,
    );
    equityCurveTimes.push(candle.closeTime);
  }

  closePosition(candles[candles.length - 1], undefined, "end");
  equityCurve[equityCurve.length - 1] = cash;

  return {
    equityCurve,
    equityCurveTimes,
    trades,
    metrics: calculateValidationMetrics(options.initialEquity, equityCurve, trades),
  };
}
