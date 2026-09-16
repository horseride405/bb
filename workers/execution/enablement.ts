import type { LiveControlReadinessResult } from "@/workers/execution/readiness";

export type ManualEnablementInput = {
  readiness: LiveControlReadinessResult;
  secretManagerConfigured: boolean;
  exchangeReconciliationConfigured: boolean;
  exchangeIdempotencyConfigured: boolean;
  signedAdapterApproved: boolean;
  failureInjectionPassed: boolean;
  explicitProductionApproval: boolean;
};

export type ManualEnablementResult = {
  enabled: false;
  blockers: string[];
};

export function evaluateManualEnablement(
  input: ManualEnablementInput,
): ManualEnablementResult {
  const blockers = [...input.readiness.blockers];
  if (!input.secretManagerConfigured) blockers.push("secret_manager_not_configured");
  if (!input.exchangeReconciliationConfigured) blockers.push("exchange_reconciliation_not_configured");
  if (!input.exchangeIdempotencyConfigured) blockers.push("exchange_idempotency_not_configured");
  if (!input.signedAdapterApproved) blockers.push("signed_adapter_not_approved");
  if (!input.failureInjectionPassed) blockers.push("failure_injection_not_verified");
  if (!input.explicitProductionApproval) blockers.push("explicit_production_approval_missing");
  return { enabled: false, blockers: [...new Set(blockers)] };
}
