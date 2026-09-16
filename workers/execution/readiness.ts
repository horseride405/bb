export type LiveControlReadinessInput = {
  liveTradingEnabled: boolean;
  emergencyStopActive: boolean;
  killSwitchActive: boolean;
  accountStatus: "pending" | "connected" | "disabled" | "error";
  lastVerifiedAt: number | null;
  approvalExpiresAt: number | null;
  approvalRevokedAt: number | null;
  reconciliationStatus: "healthy" | "mismatch" | "stale" | "error" | null;
  reconciliationObservedAt: number | null;
  now?: number;
};

export type LiveControlReadinessResult = {
  ready: boolean;
  blockers: string[];
};

export function evaluateLiveControlReadiness(
  input: LiveControlReadinessInput,
): LiveControlReadinessResult {
  const now = input.now ?? Date.now();
  const blockers: string[] = [];
  if (!input.liveTradingEnabled) blockers.push("live_trading_disabled");
  if (input.emergencyStopActive) blockers.push("live_emergency_stop_active");
  if (input.killSwitchActive) blockers.push("workspace_kill_switch_active");
  if (input.accountStatus !== "connected") blockers.push("account_not_connected");
  if (input.lastVerifiedAt === null) blockers.push("account_not_verified");
  if (input.approvalExpiresAt === null || input.approvalExpiresAt <= now) {
    blockers.push("live_approval_missing_or_expired");
  }
  if (input.approvalRevokedAt !== null) blockers.push("live_approval_revoked");
  if (input.reconciliationStatus !== "healthy") blockers.push("reconciliation_not_healthy");
  if (
    input.reconciliationObservedAt === null ||
    now - input.reconciliationObservedAt > 60_000
  ) {
    blockers.push("reconciliation_stale");
  }
  return { ready: blockers.length === 0, blockers };
}
