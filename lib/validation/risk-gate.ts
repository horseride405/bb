import type { ValidationMetrics } from "@/lib/validation/metrics";

export type BacktestRiskPolicy = {
  maxDrawdownPct: number;
};

export type RiskReview = {
  passed: boolean;
  violations: string[];
  observed: {
    maxDrawdownPct: number;
  };
  limits: {
    maxDrawdownPct: number;
  };
};

export function reviewBacktestRisk(
  metrics: ValidationMetrics,
  policy: BacktestRiskPolicy,
): RiskReview {
  const violations =
    metrics.maxDrawdownPct > policy.maxDrawdownPct
      ? [`Maximum drawdown ${metrics.maxDrawdownPct.toFixed(2)}% exceeds the ${policy.maxDrawdownPct.toFixed(2)}% workspace limit`]
      : [];

  return {
    passed: violations.length === 0,
    violations,
    observed: { maxDrawdownPct: metrics.maxDrawdownPct },
    limits: { maxDrawdownPct: policy.maxDrawdownPct },
  };
}
