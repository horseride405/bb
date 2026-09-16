import type { Database, Json } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReconciliationPosition = {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
};

export type ReconciliationInput = {
  expectedPositions: ReconciliationPosition[];
  observedPositions: ReconciliationPosition[];
  observedAt: number;
  maxAgeMs?: number;
  now?: number;
};

export type ReconciliationResult = {
  status: "healthy" | "mismatch" | "stale" | "error";
  differences: string[];
};

function positionKey(position: ReconciliationPosition) {
  return `${position.symbol}:${position.side}`;
}

export function reconcileAccountState(input: ReconciliationInput): ReconciliationResult {
  const now = input.now ?? Date.now();
  if (!Number.isFinite(input.observedAt) || input.observedAt > now) {
    return { status: "error", differences: ["invalid_observed_at"] };
  }
  const differences: string[] = [];
  const expected = new Map(input.expectedPositions.map((position) => [positionKey(position), position]));
  const observed = new Map(input.observedPositions.map((position) => [positionKey(position), position]));
  for (const [key, expectedPosition] of expected) {
    const observedPosition = observed.get(key);
    if (!observedPosition) {
      differences.push(`missing_observed_position:${key}`);
      continue;
    }
    if (
      !Number.isFinite(observedPosition.quantity) ||
      Math.abs(observedPosition.quantity - expectedPosition.quantity) > 1e-8 ||
      Math.abs(observedPosition.entryPrice - expectedPosition.entryPrice) > 1e-8
    ) {
      differences.push(`position_mismatch:${key}`);
    }
  }
  for (const key of observed.keys()) {
    if (!expected.has(key)) differences.push(`unexpected_observed_position:${key}`);
  }
  const maxAgeMs = input.maxAgeMs ?? 60_000;
  const stale = now - input.observedAt > maxAgeMs;
  if (stale) differences.push("reconciliation_stale");
  const status = stale ? "stale" : differences.length > 0 ? "mismatch" : "healthy";
  return { status, differences };
}

type WorkerClient = SupabaseClient<Database>;

export async function persistReconciliationSnapshot(
  client: WorkerClient = createServiceClient(),
  input: {
    workspaceId: string;
    accountConnectionId: string;
    observedAt: number;
    status: ReconciliationResult["status"];
    balances: Json;
    positions: Json;
    errorMessage?: string;
  },
) {
  if (!input.workspaceId || !input.accountConnectionId) {
    throw new Error("Workspace and account identifiers are required");
  }
  if (!Number.isFinite(input.observedAt) || input.observedAt > Date.now()) {
    throw new Error("Reconciliation timestamp must be a finite, non-future timestamp");
  }
  const { error } = await client.from("reconciliation_snapshots").insert({
    workspace_id: input.workspaceId,
    account_connection_id: input.accountConnectionId,
    observed_at: new Date(input.observedAt).toISOString(),
    status: input.status,
    balances: input.balances,
    positions: input.positions,
    error_message: input.errorMessage ?? null,
  });
  if (error) throw new Error(`Unable to persist reconciliation snapshot: ${error.message}`);
}
