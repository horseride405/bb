import type { Database } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordWorkerAuditEvent } from "@/workers/execution/audit";

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

export function validateExecutionFillInput(input: {
  price: number;
  quantity: number;
  fee: number;
  executedAt: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0 ||
    !Number.isFinite(input.fee) ||
    input.fee < 0 ||
    !Number.isFinite(input.executedAt) ||
    input.executedAt > now
  ) {
    throw new Error("Execution fill contains invalid values");
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
  const { data: order, error: orderError } = await client
    .from("execution_orders")
    .select("workspace_id")
    .eq("id", input.orderId)
    .single();
  if (orderError || !order) throw new Error("Execution order metadata not found");
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
  await recordWorkerAuditEvent(client, {
    workspaceId: order.workspace_id,
    eventType: "execution_order_status_changed",
    resourceType: "execution_order",
    resourceId: input.orderId,
    metadata: {
      previous_status: input.currentStatus,
      next_status: input.nextStatus,
    },
  });
}

export async function persistExecutionFill(
  input: {
    workspaceId: string;
    accountConnectionId: string;
    executionOrderId: string;
    exchangeTradeId: string;
    price: number;
    quantity: number;
    fee: number;
    feeAsset?: string | null;
    executedAt: number;
  },
  client: WorkerClient = createServiceClient(),
) {
  validateExecutionFillInput(input);
  const { data: inserted, error: insertError } = await client
    .from("execution_fills")
    .insert({
      workspace_id: input.workspaceId,
      execution_order_id: input.executionOrderId,
      account_connection_id: input.accountConnectionId,
      exchange_trade_id: input.exchangeTradeId,
      price: input.price,
      quantity: input.quantity,
      fee: input.fee,
      fee_asset: input.feeAsset ?? null,
      executed_at: new Date(input.executedAt).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (insertError?.code === "23505") return { created: false, fillId: null };
  if (insertError) throw new Error(`Unable to persist execution fill: ${insertError.message}`);
  if (!inserted) throw new Error("Execution fill was not persisted");
  return { created: true, fillId: inserted.id };
}
