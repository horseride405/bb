export type ProductionApprovalInput = {
  approvedByUserId: string;
  approvedAt: number;
  expiresAt: number;
  evidenceId: string;
  maxPositionNotional: number;
  emergencyContact: string;
  now?: number;
};

export function validateProductionApproval(input: ProductionApprovalInput) {
  const now = input.now ?? Date.now();
  const errors: string[] = [];
  if (!input.approvedByUserId.trim()) errors.push("approver_missing");
  if (!Number.isFinite(input.approvedAt) || input.approvedAt > now) errors.push("approval_timestamp_invalid");
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now) errors.push("approval_expired");
  if (input.expiresAt <= input.approvedAt) errors.push("approval_expiry_invalid");
  if (!input.evidenceId.trim()) errors.push("failure_evidence_missing");
  if (!Number.isFinite(input.maxPositionNotional) || input.maxPositionNotional <= 0) errors.push("position_limit_invalid");
  if (!input.emergencyContact.trim()) errors.push("emergency_contact_missing");
  return { valid: errors.length === 0, errors };
}
