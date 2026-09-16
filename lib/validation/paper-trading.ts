import type { Candle, FundingRate } from "@/lib/market-data/binance";
import { validateFundingRates } from "@/lib/validation/funding";
import {
  type BacktestSignal,
  type BacktestTrade,
} from "@/lib/validation/backtest";
import { calculateValidationMetrics, type ValidationMetrics } from "@/lib/validation/metrics";
import {
  createTrailingState,
  evaluateTrailingExit,
  validateTrailingExitOptions,
  type TrailingExitOptions,
  type TrailingState,
} from "@/lib/validation/trailing-exits";

export type PaperTradingOptions = TrailingExitOptions & {
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

export type PaperTradingSnapshot = {
  candle: Candle;
  equity: number;
  positionOpen: boolean;
  positionSide: "long" | "short" | null;
  metrics: ValidationMetrics;
};

type Position = {
  entryPrice: number;
  entryTime: number;
  entryFee: number;
  quantity: number;
  side: "long" | "short";
  liquidationPrice: number;
  entryIndex: number;
  fundingCost: number;
  trailing: TrailingState;
};

function validateCandle(candle: Candle, previousCandle?: Candle) {
  if (
    !Number.isFinite(candle.openTime) ||
    !Number.isFinite(candle.closeTime) ||
    !Number.isFinite(candle.close) ||
    candle.close <= 0 ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    candle.high < candle.low ||
    candle.low <= 0
  ) {
    throw new Error("Paper candles must contain positive finite close prices and timestamps");
  }
  if (previousCandle && candle.openTime <= previousCandle.openTime) {
    throw new Error("Paper candles must be sorted by increasing open time");
  }
}

export function createPaperTradingEngine(options: PaperTradingOptions) {
  if (!Number.isFinite(options.initialEquity) || options.initialEquity <= 0) {
    throw new Error("Paper initial equity must be positive");
  }
  if (!Number.isFinite(options.feeRateBps) || options.feeRateBps < 0) {
    throw new Error("Paper fee rate must be non-negative");
  }
  if (!Number.isFinite(options.slippageBps) || options.slippageBps < 0) {
    throw new Error("Paper slippage must be non-negative");
  }
  if (!Number.isFinite(options.maxLeverage) || options.maxLeverage < 1) {
    throw new Error("Paper leverage must be at least 1");
  }
  const maintenanceMarginRate = options.maintenanceMarginRate ?? 0.005;
  if (!Number.isFinite(maintenanceMarginRate) || maintenanceMarginRate <= 0 || maintenanceMarginRate >= 1) {
    throw new Error("Paper maintenance margin rate must be between 0 and 1");
  }
  if (
    options.minLiquidationDistancePct !== undefined &&
    (!Number.isFinite(options.minLiquidationDistancePct) || options.minLiquidationDistancePct <= 0)
  ) {
    throw new Error("Paper minimum liquidation distance must be positive");
  }
  validateTrailingExitOptions(options);
  validateFundingRates(options.fundingRates ?? []);

  const feeRate = options.feeRateBps / 10_000;
  const slippageRate = options.slippageBps / 10_000;
  let cash = options.initialEquity;
  let position: Position | undefined;
  let lastCandle: Candle | undefined;
  let closed = false;
  let fundingIndex = 0;
  const equityCurve: number[] = [];
  const equityCurveTimes: number[] = [];
  const trades: BacktestTrade[] = [];

  const closePosition = (
    candle: Candle,
    forcedExitPrice?: number,
    exitReason: BacktestTrade["exitReason"] = "signal",
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

  const createSnapshot = (candle: Candle): PaperTradingSnapshot => ({
    candle,
    equity: equityCurve.at(-1) ?? cash,
    positionOpen: position !== undefined,
    positionSide: position?.side ?? null,
    metrics: calculateValidationMetrics(options.initialEquity, equityCurve, trades),
  });

  const processCandle = (candle: Candle): PaperTradingSnapshot => {
    if (closed) throw new Error("Paper trading engine is closed");
    validateCandle(candle, lastCandle);
    const signal = options.signal(candle, equityCurve.length);
    if (signal !== "long" && signal !== "short" && signal !== "flat") {
      throw new Error("Paper signal must be long, short, or flat");
    }

    let liquidatedThisCandle = false;
    if (
      position &&
      equityCurve.length > position.entryIndex &&
      ((position.side === "long" && candle.low <= position.liquidationPrice) ||
        (position.side === "short" && candle.high >= position.liquidationPrice))
    ) {
      closePosition(candle, position.liquidationPrice, "liquidation");
      liquidatedThisCandle = true;
    }
    if (!liquidatedThisCandle && position && equityCurve.length > position.entryIndex) {
      const trailingExit = evaluateTrailingExit(
        position.side,
        candle,
        position.entryPrice,
        position.trailing,
        options,
      );
      if (trailingExit) {
        closePosition(
          candle,
          trailingExit.price * (position.side === "long" ? 1 - slippageRate : 1 + slippageRate),
          trailingExit.reason,
        );
        liquidatedThisCandle = true;
      }
    }
    if (!liquidatedThisCandle && position && (signal === "flat" || signal !== position.side)) {
      closePosition(candle);
    }
    if (!liquidatedThisCandle && !position && signal !== "flat") {
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
        throw new Error("Paper liquidation distance is below the workspace policy");
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
          liquidationPrice,
          entryIndex: equityCurve.length,
          fundingCost: 0,
          trailing: createTrailingState(entryPrice),
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

    const equity = position
      ? cash + (candle.close - position.entryPrice) * position.quantity * (position.side === "long" ? 1 : -1)
      : cash;
    equityCurve.push(equity);
    equityCurveTimes.push(candle.closeTime);
    lastCandle = candle;
    return createSnapshot(candle);
  };

  const finish = (): PaperTradingSnapshot | null => {
    if (closed) return lastCandle ? createSnapshot(lastCandle) : null;
    closed = true;
    if (!lastCandle) return null;
    closePosition(lastCandle, undefined, "end");
    if (equityCurve.length > 0) equityCurve[equityCurve.length - 1] = cash;
    return createSnapshot(lastCandle);
  };

  return {
    processCandle,
    finish,
    getMetrics: () => calculateValidationMetrics(options.initialEquity, equityCurve, trades),
    getResult: () => ({
      equityCurve: [...equityCurve],
      equityCurveTimes: [...equityCurveTimes],
      trades: [...trades],
      fundingRateCount: options.fundingRates?.length ?? 0,
    }),
    isClosed: () => closed,
  };
}
