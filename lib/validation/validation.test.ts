import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/binance";
import { runBacktest, type BacktestOptions } from "@/lib/validation/backtest";
import { validateCandle } from "@/lib/validation/candles";
import { validateFundingRates } from "@/lib/validation/funding";
import { reviewBacktestRisk } from "@/lib/validation/risk-gate";
import { validateTrailingExitOptions } from "@/lib/validation/trailing-exits";

function candle(index: number, close: number, high = close, low = close): Candle {
  const openTime = index * 60_000;
  return {
    openTime,
    closeTime: openTime + 59_999,
    open: close,
    high,
    low,
    close,
    volume: 1,
  };
}

function run(
  candles: Candle[],
  signals: Array<"long" | "short" | "flat">,
  options: Partial<BacktestOptions> = {},
) {
  return runBacktest(candles, {
    initialEquity: 1_000,
    feeRateBps: 0,
    slippageBps: 0,
    maxLeverage: 2,
    signal: (_, index) => signals[index] ?? "flat",
    ...options,
  });
}

describe("bidirectional backtest safety", () => {
  it("records long-to-short reversals with side-aware P&L", () => {
    const result = run(
      [candle(0, 100), candle(1, 110), candle(2, 120), candle(3, 90)],
      ["long", "long", "short", "short"],
    );

    expect(result.trades.map((trade) => trade.side)).toEqual(["long", "short"]);
    expect(result.trades[0]?.pnl).toBe(400);
    expect(result.trades[1]?.pnl).toBe(700);
  });

  it("prioritizes liquidation before trailing exits", () => {
    const result = run(
      [candle(0, 100), candle(1, 90, 100, 90), candle(2, 90)],
      ["long", "long", "flat"],
      { maxLeverage: 10, trailingStopLossPct: 5 },
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.exitReason).toBe("liquidation");
    expect(result.trades[0]?.liquidated).toBe(true);
  });

  it("applies a bidirectional trailing stop", () => {
    const result = run(
      [candle(0, 100), candle(1, 110, 120, 109), candle(2, 105, 115, 100)],
      ["long", "long", "long"],
      { trailingStopLossPct: 10 },
    );

    expect(result.trades[0]?.exitReason).toBe("trailing_stop_loss");
  });

  it("applies signed funding to long and short positions", () => {
    const fundingRates = [
      { fundingTime: 119_999, fundingRate: 0.01 },
    ];
    const long = run(
      [candle(0, 100), candle(1, 110), candle(2, 110)],
      ["long", "long", "flat"],
      { fundingRates },
    );
    const short = run(
      [candle(0, 100), candle(1, 90), candle(2, 90)],
      ["short", "short", "flat"],
      { fundingRates },
    );

    expect(long.trades[0]?.funding).toBeGreaterThan(0);
    expect(short.trades[0]?.funding).toBeLessThan(0);
  });
});

describe("validation safety boundaries", () => {
  it("rejects malformed candles and out-of-order funding", () => {
    expect(() => validateCandle(candle(0, 100, 99, 100))).toThrow();
    expect(() =>
      validateFundingRates([
        { fundingTime: 60_000, fundingRate: 0 },
        { fundingTime: 0, fundingRate: 0 },
      ]),
    ).toThrow("sorted");
    expect(() =>
      validateFundingRates([{ fundingTime: -1, fundingRate: 0 }]),
    ).toThrow();
  });

  it("requires activation for trailing take-profit", () => {
    expect(() =>
      validateTrailingExitOptions({ trailingTakeProfitPct: 5 }),
    ).toThrow("activation");
  });

  it("reviews drawdown, daily loss, frequency, and cooldown together", () => {
    const review = reviewBacktestRisk(
      {
        netPnl: -100,
        totalReturnPct: -10,
        maxDrawdownPct: 12,
        winRatePct: 0,
        profitFactor: 0,
        tradeCount: 3,
        fees: 0,
        funding: 0,
      },
      {
        maxDailyLossPct: 5,
        maxDrawdownPct: 10,
        maxTradesPerHour: 2,
        minTradeIntervalSeconds: 120,
      },
      {
        initialEquity: 1_000,
        curve: [1_000, 950, 880],
        times: [0, 60_000, 120_000],
      },
      60 * 60 * 1_000,
      [{ entryTime: 0 }, { entryTime: 60_000 }, { entryTime: 120_000 }],
    );

    expect(review.passed).toBe(false);
    expect(review.violations).toHaveLength(4);
  });
});
