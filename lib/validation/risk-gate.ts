import type { ValidationMetrics } from "@/lib/validation/metrics";

export type BacktestRiskPolicy = {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxTradesPerHour: number;
  minTradeIntervalSeconds: number;
};

export type RiskReview = {
  passed: boolean;
  violations: string[];
  observed: {
    maxDailyLossPct: number;
    maxDrawdownPct: number;
    tradesPerHour: number;
    minimumTradeIntervalSeconds: number;
  };
  limits: {
    maxDailyLossPct: number;
    maxDrawdownPct: number;
    tradesPerHour: number;
    minimumTradeIntervalSeconds: number;
  };
};

function calculateMaxDailyLossPct(initialEquity: number, equityCurve: number[], equityCurveTimes: number[]) {
  if (equityCurve.length !== equityCurveTimes.length || equityCurve.length === 0) return 0;

  let maxDailyLossPct = 0;
  let dayStartEquity = initialEquity;
  let currentDay = new Date(equityCurveTimes[0]).toISOString().slice(0, 10);
  for (let index = 0; index < equityCurve.length; index += 1) {
    const day = new Date(equityCurveTimes[index]).toISOString().slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      dayStartEquity = equityCurve[index - 1] ?? dayStartEquity;
    }
    if (dayStartEquity > 0) {
      maxDailyLossPct = Math.max(
        maxDailyLossPct,
        ((dayStartEquity - equityCurve[index]) / dayStartEquity) * 100,
      );
    }
  }
  return Math.max(0, maxDailyLossPct);
}

export function reviewBacktestRisk(
  metrics: ValidationMetrics,
  policy: BacktestRiskPolicy,
  equity: { initialEquity: number; curve: number[]; times: number[] } = {
    initialEquity: 1,
    curve: [],
    times: [],
  },
  durationMs?: number,
  trades: Array<{ entryTime: number }> = [],
): RiskReview {
  const maxDailyLossPct = calculateMaxDailyLossPct(equity.initialEquity, equity.curve, equity.times);
  const violations = [];
  if (metrics.maxDrawdownPct > policy.maxDrawdownPct) {
    violations.push(
      `Maximum drawdown ${metrics.maxDrawdownPct.toFixed(2)}% exceeds the ${policy.maxDrawdownPct.toFixed(2)}% workspace limit`,
    );
  }
  if (maxDailyLossPct > policy.maxDailyLossPct) {
    violations.push(
      `Maximum daily loss ${maxDailyLossPct.toFixed(2)}% exceeds the ${policy.maxDailyLossPct.toFixed(2)}% workspace limit`,
    );
  }
  const observedDurationMs = durationMs ?? Math.max((equity.times.at(-1) ?? 0) - (equity.times[0] ?? 0), 60_000);
  const tradesPerHour = metrics.tradeCount / (observedDurationMs / (60 * 60 * 1_000));
  if (tradesPerHour > policy.maxTradesPerHour) {
    violations.push(
      `Trade frequency ${tradesPerHour.toFixed(2)}/hour exceeds the ${policy.maxTradesPerHour.toFixed(2)}/hour workspace limit`,
    );
  }
  let minimumTradeIntervalSeconds = Number.POSITIVE_INFINITY;
  const sortedEntryTimes = trades.map((trade) => trade.entryTime).sort((left, right) => left - right);
  for (let index = 1; index < sortedEntryTimes.length; index += 1) {
    minimumTradeIntervalSeconds = Math.min(
      minimumTradeIntervalSeconds,
      (sortedEntryTimes[index] - sortedEntryTimes[index - 1]) / 1_000,
    );
  }
  if (!Number.isFinite(minimumTradeIntervalSeconds)) minimumTradeIntervalSeconds = 0;
  if (
    sortedEntryTimes.length > 1 &&
    minimumTradeIntervalSeconds < policy.minTradeIntervalSeconds
  ) {
    violations.push(
      `Minimum trade interval ${minimumTradeIntervalSeconds.toFixed(0)}s is below the ${policy.minTradeIntervalSeconds}s workspace cooldown`,
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    observed: {
      maxDailyLossPct,
      maxDrawdownPct: metrics.maxDrawdownPct,
      tradesPerHour,
      minimumTradeIntervalSeconds,
    },
    limits: {
      maxDailyLossPct: policy.maxDailyLossPct,
      maxDrawdownPct: policy.maxDrawdownPct,
      tradesPerHour: policy.maxTradesPerHour,
      minimumTradeIntervalSeconds: policy.minTradeIntervalSeconds,
    },
  };
}
