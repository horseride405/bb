import type { Database } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExecutionOrderStatus =
  | "pending"
  | "submitted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

const transitions: Record<ExecutionOrderStatus, readonly ExecutionOrderStatus[]> = {
  pending: ["submitted", "cancelled", "rejected"],
  submitted: ["partially_filled", "filled", "cancelled", "rejected"],
  partially_filled: ["partially_filled", "filled", "cancelled"],
  filled: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionExecutionOrder(
  current: ExecutionOrderStatus,
  next: ExecutionOrderStatus,
) {
  return current === next || transitions[current].includes(next);
}

export function assertExecutionOrderTransition(
  current: ExecutionOrderStatus,
  next: ExecutionOrderStatus,
) {
  if (!canTransitionExecutionOrder(current, next)) {
    throw new Error(`Invalid execution order transition: ${current} -> ${next}`);
  }
}

type WorkerClient = SupabaseClient<Database>;

export async function persistExecutionOrderStatus(
  input: {
    orderId: string;
    currentStatus: ExecutionOrderStatus;
    nextStatus: ExecutionOrderStatus;
    exchangeOrderId?: string | null;
    rejectionReason?: string | null;
  },
  client: WorkerClient = createServiceClient(),
) {
  assertExecutionOrderTransition(input.currentStatus, input.nextStatus);
  const terminal = input.nextStatus === "filled"
    || input.nextStatus === "cancelled"
    || input.nextStatus === "rejected";
  const { error } = await client
    .from("execution_orders")
    .update({
      status: input.nextStatus,
      exchange_order_id: input.exchangeOrderId ?? undefined,
      rejection_reason: input.rejectionReason ?? undefined,
      submitted_at: input.nextStatus === "submitted" ? new Date().toISOString() : undefined,
      completed_at: terminal ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .eq("status", input.currentStatus);
  if (error) throw new Error(`Unable to persist execution order state: ${error.message}`);
}
