export type ReconciliationState = {
  status: "healthy" | "mismatch" | "stale" | "error";
  observedAt: number;
};

export type LiveExecutionGateInput = {
  liveTradingEnabled: boolean;
  emergencyStopActive: boolean;
  killSwitchActive: boolean;
  accountStatus: "pending" | "connected" | "disabled" | "error";
  credentialConfigured: boolean;
  approvalExpiresAt: number | null;
  reconciliation: ReconciliationState | null;
  now?: number;
  reduceOnly: boolean;
  riskAllowed: boolean;
  positionNotional: number;
  maxPositionNotional: number;
};

export type LiveExecutionGateResult = {
  allowed: boolean;
  violations: string[];
};

export function evaluateLiveExecutionGate(
  input: LiveExecutionGateInput,
): LiveExecutionGateResult {
  const now = input.now ?? Date.now();
  const violations: string[] = [];
  if (!input.liveTradingEnabled) violations.push("live_trading_disabled");
  if (input.emergencyStopActive) violations.push("live_emergency_stop_active");
  if (input.killSwitchActive) violations.push("workspace_kill_switch_active");
  if (input.accountStatus !== "connected") violations.push("account_not_connected");
  if (!input.credentialConfigured) violations.push("account_credentials_unavailable");
  if (input.approvalExpiresAt === null || input.approvalExpiresAt <= now) {
    violations.push("live_approval_missing_or_expired");
  }
  if (!input.reconciliation || input.reconciliation.status !== "healthy") {
    violations.push("reconciliation_not_healthy");
  }
  if (
    input.reconciliation &&
    now - input.reconciliation.observedAt > 60_000
  ) {
    violations.push("reconciliation_stale");
  }
  if (!input.riskAllowed) violations.push("execution_risk_rejected");
  if (!Number.isFinite(input.positionNotional) || input.positionNotional < 0) {
    violations.push("invalid_position_notional");
  }
  if (
    !Number.isFinite(input.maxPositionNotional) ||
    input.maxPositionNotional <= 0 ||
    input.positionNotional > input.maxPositionNotional
  ) {
    violations.push("position_notional_exceeds_limit");
  }
  if (!input.reduceOnly) violations.push("non_reduce_only_execution_disabled");
  return { allowed: violations.length === 0, violations };
}
