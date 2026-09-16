import {
  evaluateEntitlement,
  type BillingPlan,
  type BillingSubscriptionStatus,
} from "@/lib/billing/entitlements";

export type UsageSnapshot = {
  validationRuns: number;
  activeStrategies: number;
  connectedAccounts: number;
};

export function assertEntitledUsage(input: {
  plan: BillingPlan;
  subscriptionStatus: BillingSubscriptionStatus;
  resource: "strategy" | "validation_run" | "connected_account";
  usage: UsageSnapshot;
}) {
  const currentUsage = input.resource === "strategy"
    ? input.usage.activeStrategies
    : input.resource === "validation_run"
      ? input.usage.validationRuns
      : input.usage.connectedAccounts;
  const decision = evaluateEntitlement({
    plan: input.plan,
    subscriptionStatus: input.subscriptionStatus,
    resource: input.resource,
    currentUsage,
  });
  if (!decision.allowed) {
    throw new Error(decision.reason ?? "Workspace entitlement denied");
  }
  return decision;
}

export function getCurrentUsagePeriod(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}
