import type { ValidationMetrics } from "@/lib/validation/metrics";

export type BacktestRiskPolicy = {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
};

export type RiskReview = {
  passed: boolean;
  violations: string[];
  observed: {
    maxDailyLossPct: number;
    maxDrawdownPct: number;
  };
  limits: {
    maxDailyLossPct: number;
    maxDrawdownPct: number;
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

  return {
    passed: violations.length === 0,
    violations,
    observed: { maxDailyLossPct, maxDrawdownPct: metrics.maxDrawdownPct },
    limits: { maxDailyLossPct: policy.maxDailyLossPct, maxDrawdownPct: policy.maxDrawdownPct },
  };
}
