import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data/binance";
import { evaluateLiveExecutionGate } from "@/lib/execution/live-gate";
import { runBacktest, type BacktestOptions } from "@/lib/validation/backtest";
import { validateCandle } from "@/lib/validation/candles";
import { validateFundingRates } from "@/lib/validation/funding";
import { reviewBacktestRisk } from "@/lib/validation/risk-gate";
import { validateTrailingExitOptions } from "@/lib/validation/trailing-exits";
import { reconcileAccountState } from "@/workers/execution/reconciliation";
import { intentStatusFromGate } from "@/workers/execution/intent-preflight";
import { evaluateLiveControlReadiness } from "@/workers/execution/readiness";
import { classifyWorkerHeartbeat } from "@/workers/execution/heartbeat";
import { retryDelayMs, retryWithBackoff } from "@/workers/execution/retry";
import { runWorkerCycle } from "@/workers/execution/worker-cycle";
import { runWorkerSupervisor } from "@/workers/execution/supervisor";
import {
  assertExecutionOrderTransition,
  canTransitionExecutionOrder,
  reconcileExecutionOrderFills,
  validateExecutionFillInput,
} from "@/workers/execution/order-state";
import { canCancelExecutionIntent } from "@/workers/execution/intent-preflight";

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

describe("Phase 2 execution safety", () => {
  it("maps gate decisions to non-submitting intent states", () => {
    expect(intentStatusFromGate(false)).toBe("blocked");
    expect(intentStatusFromGate(true)).toBe("preflighted");
  });

  it("fails closed when live prerequisites are missing", () => {
    const result = evaluateLiveExecutionGate({
      liveTradingEnabled: false,
      emergencyStopActive: true,
      killSwitchActive: false,
      accountStatus: "pending",
      credentialConfigured: false,
      approvalExpiresAt: null,
      reconciliation: null,
      reduceOnly: false,
      riskAllowed: true,
      positionNotional: 100,
      maxPositionNotional: 1_000,
      now: 1_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      "live_trading_disabled",
      "live_emergency_stop_active",
      "account_not_connected",
      "account_credentials_unavailable",
      "live_approval_missing_or_expired",
      "reconciliation_not_healthy",
      "non_reduce_only_execution_disabled",
    ]));
  });

  it("allows only a fresh, approved, reduce-only preflight", () => {
    const result = evaluateLiveExecutionGate({
      liveTradingEnabled: true,
      emergencyStopActive: false,
      killSwitchActive: false,
      accountStatus: "connected",
      credentialConfigured: true,
      approvalExpiresAt: 2_000,
      reconciliation: { status: "healthy", observedAt: 950 },
      reduceOnly: true,
      riskAllowed: true,
      positionNotional: 100,
      maxPositionNotional: 1_000,
      now: 1_000,
    });

    expect(result).toEqual({ allowed: true, violations: [] });
  });

  it("detects reconciliation mismatches and unexpected positions", () => {
    const result = reconcileAccountState({
      observedAt: Date.now(),
      expectedPositions: [{ symbol: "BTCUSDT", side: "long", quantity: 1, entryPrice: 100 }],
      observedPositions: [
        { symbol: "BTCUSDT", side: "long", quantity: 2, entryPrice: 100 },
        { symbol: "ETHUSDT", side: "short", quantity: 1, entryPrice: 50 },
      ],
    });

    expect(result.status).toBe("mismatch");
    expect(result.differences).toEqual(expect.arrayContaining([
      "position_mismatch:BTCUSDT:long",
      "unexpected_observed_position:ETHUSDT:short",
    ]));
  });

  it("reports every control-plane readiness blocker without authorizing orders", () => {
    const result = evaluateLiveControlReadiness({
      liveTradingEnabled: false,
      emergencyStopActive: true,
      killSwitchActive: true,
      accountStatus: "pending",
      lastVerifiedAt: null,
      approvalExpiresAt: null,
      approvalRevokedAt: 2_000,
      reconciliationStatus: "mismatch",
      reconciliationObservedAt: 0,
      now: 120_000,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "live_trading_disabled",
      "live_emergency_stop_active",
      "workspace_kill_switch_active",
      "account_not_connected",
      "account_not_verified",
      "live_approval_missing_or_expired",
      "live_approval_revoked",
      "reconciliation_not_healthy",
      "reconciliation_stale",
    ]));
  });

  it("fails closed for future reconciliation timestamps and marks stale state", () => {
    expect(reconcileAccountState({
      observedAt: 2_000,
      expectedPositions: [],
      observedPositions: [],
      now: 1_000,
    })).toEqual({ status: "error", differences: ["invalid_observed_at"] });

    const stale = reconcileAccountState({
      observedAt: 0,
      expectedPositions: [],
      observedPositions: [],
      maxAgeMs: 60_000,
      now: 120_000,
    });
    expect(stale.status).toBe("stale");
    expect(stale.differences).toContain("reconciliation_stale");
  });

  it("classifies worker heartbeat degradation and offline state conservatively", () => {
    expect(classifyWorkerHeartbeat({
      observedAt: 100_000,
      lastSuccessAt: 100_000,
      consecutiveFailures: 0,
      now: 100_001,
    })).toBe("healthy");
    expect(classifyWorkerHeartbeat({
      observedAt: 100_000,
      lastSuccessAt: 100_000,
      consecutiveFailures: 2,
      now: 100_001,
    })).toBe("degraded");
    expect(classifyWorkerHeartbeat({
      observedAt: 0,
      lastSuccessAt: 0,
      consecutiveFailures: 0,
      now: 200_000,
    })).toBe("offline");
  });

  it("bounds retries and exponential backoff for worker persistence", async () => {
    expect(retryDelayMs(1, 100, 250)).toBe(100);
    expect(retryDelayMs(4, 100, 250)).toBe(250);
    const delays: number[] = [];
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    }, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: async (delayMs) => { delays.push(delayMs); },
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it("classifies heartbeat recovery as healthy after failures clear", () => {
    expect(classifyWorkerHeartbeat({
      observedAt: 100_000,
      lastSuccessAt: 100_000,
      consecutiveFailures: 0,
      now: 100_001,
    })).toBe("healthy");
  });

  it("preserves worker-cycle failures instead of reporting success", async () => {
    await expect(runWorkerCycle({
      workspaceId: "workspace",
      accountConnectionId: "account",
      workerName: "reconciliation",
      consecutiveFailures: 1,
      lastSuccessAt: 100_000,
      now: () => 100_001,
      client: {
        from: (table: string) => table === "execution_worker_heartbeats"
          ? {
              select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
              upsert: async () => ({ error: null }),
            }
          : { insert: async () => ({ error: null }) },
      } as never,
    }, async () => {
      throw new Error("reconciliation failed");
    })).rejects.toThrow("reconciliation failed");
  });

  it("propagates shutdown and runs cleanup after the current cycle", async () => {
    const controller = new AbortController();
    let cycles = 0;
    let shutdown = false;
    await runWorkerSupervisor({
      signal: controller.signal,
      pollIntervalMs: 100,
      maxBackoffMs: 100,
      runCycle: async (signal) => {
        cycles += 1;
        expect(signal.aborted).toBe(false);
        controller.abort();
      },
      onShutdown: async () => {
        shutdown = true;
      },
    });
    expect(cycles).toBe(1);
    expect(shutdown).toBe(true);
  });

  it("allows only monotonic execution-order lifecycle transitions", () => {
    expect(canTransitionExecutionOrder("pending", "submitted")).toBe(true);
    expect(canTransitionExecutionOrder("submitted", "partially_filled")).toBe(true);
    expect(canTransitionExecutionOrder("partially_filled", "filled")).toBe(true);
    expect(canTransitionExecutionOrder("filled", "submitted")).toBe(false);
    expect(() => assertExecutionOrderTransition("cancelled", "filled")).toThrow(
      "Invalid execution order transition",
    );
  });

  it("rejects invalid or future execution fills", () => {
    expect(() => validateExecutionFillInput({
      price: 0,
      quantity: 1,
      fee: 0,
      executedAt: 100,
      now: 100,
    })).toThrow("Execution fill contains invalid values");
    expect(() => validateExecutionFillInput({
      price: 10,
      quantity: 1,
      fee: 0,
      executedAt: 101,
      now: 100,
    })).toThrow("Execution fill contains invalid values");
  });

  it("blocks inconsistent order fill totals and terminal intent reuse", () => {
    expect(reconcileExecutionOrderFills({
      orderQuantity: 10,
      filledQuantity: 11,
      status: "filled",
    })).toEqual({
      status: "mismatch",
      differences: ["filled_quantity_exceeds_order"],
    });
    expect(reconcileExecutionOrderFills({
      orderQuantity: 10,
      filledQuantity: 4,
      status: "partially_filled",
    }).status).toBe("healthy");
    expect(canCancelExecutionIntent("preflighted")).toBe(true);
    expect(canCancelExecutionIntent("cancelled")).toBe(false);
  });
});
