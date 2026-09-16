import type { Database, Json } from "@/lib/supabase/database";
import {
  evaluateLiveExecutionGate,
  type LiveExecutionGateInput,
} from "@/lib/execution/live-gate";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

type WorkerClient = SupabaseClient<Database>;

export type ExecutionIntentRequest = {
  workspaceId: string;
  strategyId: string;
  accountConnectionId: string;
  idempotencyKey: string;
  side: "long" | "short" | "flat";
  reduceOnly: boolean;
  positionNotional: number;
  riskSnapshot: Json;
  gate: LiveExecutionGateInput;
};

export type ExecutionIntentPreflightResult = {
  intentId: string;
  status: "blocked" | "preflighted";
  allowed: boolean;
  violations: string[];
  submitted: false;
  created: boolean;
};

export function intentStatusFromGate(allowed: boolean): "blocked" | "preflighted" {
  return allowed ? "preflighted" : "blocked";
}

export async function preflightAndPersistExecutionIntent(
  request: ExecutionIntentRequest,
  client: WorkerClient = createServiceClient(),
): Promise<ExecutionIntentPreflightResult> {
  const gate = evaluateLiveExecutionGate(request.gate);
  const { data: existing, error: existingError } = await client
    .from("execution_intents")
    .select("id, workspace_id, strategy_id, account_connection_id, side, reduce_only, position_notional, status, blocked_reasons")
    .eq("idempotency_key", request.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to inspect execution intent: ${existingError.message}`);
  }
  if (existing) {
    if (
      existing.workspace_id !== request.workspaceId ||
      existing.strategy_id !== request.strategyId ||
      existing.account_connection_id !== request.accountConnectionId ||
      existing.side !== request.side ||
      existing.reduce_only !== request.reduceOnly ||
      Number(existing.position_notional) !== request.positionNotional
    ) {
      throw new Error("Idempotency key was reused for a different execution intent");
    }
    const existingViolations = Array.isArray(existing.blocked_reasons)
      ? existing.blocked_reasons.filter((value): value is string => typeof value === "string")
      : [];
    return {
      intentId: existing.id,
      status: existing.status === "preflighted" ? "preflighted" : "blocked",
      allowed: existing.status === "preflighted",
      violations: existingViolations,
      submitted: false,
      created: false,
    };
  }

  const status = intentStatusFromGate(gate.allowed);
  const { data: inserted, error: insertError } = await client
    .from("execution_intents")
    .insert({
      workspace_id: request.workspaceId,
      strategy_id: request.strategyId,
      account_connection_id: request.accountConnectionId,
      idempotency_key: request.idempotencyKey,
      side: request.side,
      reduce_only: request.reduceOnly,
      position_notional: request.positionNotional,
      status,
      risk_snapshot: request.riskSnapshot,
      blocked_reasons: gate.violations,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return preflightAndPersistExecutionIntent(request, client);
    }
    throw new Error(`Unable to persist execution intent: ${insertError.message}`);
  }
  const { error: auditError } = await client.from("audit_events").insert({
    workspace_id: request.workspaceId,
    actor_user_id: null,
    event_type: gate.allowed ? "execution_intent_preflighted" : "execution_intent_blocked",
    resource_type: "execution_intent",
    resource_id: inserted.id,
    metadata: {
      strategy_id: request.strategyId,
      account_connection_id: request.accountConnectionId,
      idempotency_key: request.idempotencyKey,
      side: request.side,
      reduce_only: request.reduceOnly,
      position_notional: request.positionNotional,
      violations: gate.violations,
    },
  });
  if (auditError) {
    throw new Error(`Unable to persist execution intent audit event: ${auditError.message}`);
  }
  return {
    intentId: inserted.id,
    status,
    allowed: gate.allowed,
    violations: gate.violations,
    submitted: false,
    created: true,
  };
}
