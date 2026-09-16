import type { Database } from "@/lib/supabase/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistWorkerHeartbeat } from "@/workers/execution/heartbeat";

type WorkerClient = SupabaseClient<Database>;

export type WorkerCycleInput = {
  workspaceId: string;
  accountConnectionId: string;
  workerName: string;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  client?: WorkerClient;
  now?: () => number;
};

export async function runWorkerCycle<T>(
  input: WorkerCycleInput,
  operation: () => Promise<T>,
): Promise<T> {
  const now = input.now ?? Date.now;
  const observedAt = now();
  try {
    const result = await operation();
    await persistWorkerHeartbeat({
      workspaceId: input.workspaceId,
      accountConnectionId: input.accountConnectionId,
      workerName: input.workerName,
      observedAt,
      lastSuccessAt: observedAt,
      consecutiveFailures: 0,
      errorMessage: null,
    }, input.client);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker cycle failed";
    await persistWorkerHeartbeat({
      workspaceId: input.workspaceId,
      accountConnectionId: input.accountConnectionId,
      workerName: input.workerName,
      observedAt,
      lastSuccessAt: input.lastSuccessAt,
      consecutiveFailures: input.consecutiveFailures + 1,
      errorMessage: "Worker cycle failed",
    }, input.client);
    throw new Error(message);
  }
}
