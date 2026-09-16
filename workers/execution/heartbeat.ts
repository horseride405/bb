import type { Database } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retryWithBackoff } from "@/workers/execution/retry";
import { recordWorkerAuditEvent } from "@/workers/execution/audit";

export type WorkerHeartbeatStatus = "healthy" | "degraded" | "offline";

export type WorkerHeartbeatInput = {
  workspaceId: string;
  accountConnectionId: string;
  workerName: string;
  observedAt: number;
  lastSuccessAt: number | null;
  consecutiveFailures: number;
  errorMessage?: string | null;
};

type WorkerClient = SupabaseClient<Database>;

export function classifyWorkerHeartbeat(input: {
  observedAt: number;
  lastSuccessAt: number | null;
  consecutiveFailures: number;
  now?: number;
  maxAgeMs?: number;
}): WorkerHeartbeatStatus {
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 60_000;
  if (
    !Number.isFinite(input.observedAt) ||
    input.observedAt > now ||
    input.consecutiveFailures < 0 ||
    !Number.isInteger(input.consecutiveFailures)
  ) {
    return "offline";
  }
  if (
    input.lastSuccessAt === null ||
    input.lastSuccessAt > now ||
    now - input.observedAt > maxAgeMs ||
    now - input.lastSuccessAt > maxAgeMs * 2
  ) {
    return "offline";
  }
  return input.consecutiveFailures > 0 ? "degraded" : "healthy";
}

export async function persistWorkerHeartbeat(
  input: WorkerHeartbeatInput,
  client: WorkerClient = createServiceClient(),
) {
  if (!input.workspaceId || !input.accountConnectionId || !input.workerName) {
    throw new Error("Workspace, account, and worker identifiers are required");
  }
  const status = classifyWorkerHeartbeat(input);
  const { data: existing, error: existingError } = await client
    .from("execution_worker_heartbeats")
    .select("status")
    .eq("workspace_id", input.workspaceId)
    .eq("account_connection_id", input.accountConnectionId)
    .eq("worker_name", input.workerName)
    .maybeSingle();
  if (existingError) throw new Error(`Unable to inspect worker heartbeat: ${existingError.message}`);
  await retryWithBackoff(async () => {
    const { error } = await client.from("execution_worker_heartbeats").upsert({
      workspace_id: input.workspaceId,
      account_connection_id: input.accountConnectionId,
      worker_name: input.workerName,
      status,
      observed_at: new Date(input.observedAt).toISOString(),
      last_success_at: input.lastSuccessAt ? new Date(input.lastSuccessAt).toISOString() : null,
      consecutive_failures: input.consecutiveFailures,
      error_message: input.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,account_connection_id,worker_name" });
    if (error) throw new Error(`Unable to persist worker heartbeat: ${error.message}`);
  });
  if (!existing || existing.status !== status) {
    await recordWorkerAuditEvent(client, {
      workspaceId: input.workspaceId,
      eventType: "execution_worker_status_changed",
      resourceType: "execution_worker_heartbeat",
      resourceId: input.accountConnectionId,
      metadata: {
        worker_name: input.workerName,
        previous_status: existing?.status ?? null,
        next_status: status,
        consecutive_failures: input.consecutiveFailures,
      },
    });
  }
  return status;
}
