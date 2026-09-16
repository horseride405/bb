export type BillingPlan = "starter" | "pro" | "enterprise";
export type BillingSubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type PlanEntitlements = {
  maxStrategies: number;
  maxValidationRunsPerPeriod: number;
  maxConnectedAccounts: number;
  liveControls: boolean;
  teamManagement: boolean;
};

const entitlements: Record<BillingPlan, PlanEntitlements> = {
  starter: {
    maxStrategies: 3,
    maxValidationRunsPerPeriod: 50,
    maxConnectedAccounts: 1,
    liveControls: false,
    teamManagement: false,
  },
  pro: {
    maxStrategies: 25,
    maxValidationRunsPerPeriod: 500,
    maxConnectedAccounts: 5,
    liveControls: true,
    teamManagement: true,
  },
  enterprise: {
    maxStrategies: Number.POSITIVE_INFINITY,
    maxValidationRunsPerPeriod: Number.POSITIVE_INFINITY,
    maxConnectedAccounts: Number.POSITIVE_INFINITY,
    liveControls: true,
    teamManagement: true,
  },
};

export function getPlanEntitlements(plan: BillingPlan) {
  return entitlements[plan];
}

export function evaluateEntitlement(input: {
  plan: BillingPlan;
  subscriptionStatus: BillingSubscriptionStatus;
  resource: "strategy" | "validation_run" | "connected_account" | "live_controls" | "team_management";
  currentUsage: number;
}) {
  const planEntitlements = getPlanEntitlements(input.plan);
  if (input.subscriptionStatus === "cancelled" || input.subscriptionStatus === "past_due") {
    return { allowed: false, reason: "subscription_not_active" as const };
  }
  if (input.resource === "live_controls") {
    return { allowed: planEntitlements.liveControls, reason: planEntitlements.liveControls ? null : "plan_not_entitled" };
  }
  if (input.resource === "team_management") {
    return { allowed: planEntitlements.teamManagement, reason: planEntitlements.teamManagement ? null : "plan_not_entitled" };
  }
  const limit = input.resource === "strategy"
    ? planEntitlements.maxStrategies
    : input.resource === "validation_run"
      ? planEntitlements.maxValidationRunsPerPeriod
      : planEntitlements.maxConnectedAccounts;
  return {
    allowed: input.currentUsage < limit,
    reason: input.currentUsage < limit ? null : "plan_limit_reached",
  };
}
