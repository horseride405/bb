import type { Database } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordWorkerAuditEvent } from "@/workers/execution/audit";

export type AccountVerifier = {
  verify(input: {
    environment: "testnet" | "mainnet";
    secretReference: string;
  }): Promise<void>;
};

export type AccountValidationResult = {
  accountConnectionId: string;
  status: "connected" | "error";
  verifiedAt: number | null;
  errorMessage: string | null;
};

type WorkerClient = SupabaseClient<Database>;

export async function validateBinanceAccountConnection(
  input: {
    accountConnectionId: string;
    verifier: AccountVerifier;
  },
  client: WorkerClient = createServiceClient(),
): Promise<AccountValidationResult> {
  const { data: account, error: accountError } = await client
    .from("binance_account_connections")
    .select("id, workspace_id, environment, status")
    .eq("id", input.accountConnectionId)
    .single();
  if (accountError || !account) {
    throw new Error("Account connection metadata not found");
  }

  const { data: secret, error: secretError } = await client
    .from("binance_account_secrets")
    .select("secret_ref")
    .eq("account_connection_id", input.accountConnectionId)
    .single();
  if (secretError || !secret) {
    const message = "Worker credential reference is unavailable";
    await updateAccountStatus(client, input.accountConnectionId, "error", message, null);
    await recordStatusTransition(client, account.workspace_id, account.id, account.status, "error", message);
    return {
      accountConnectionId: input.accountConnectionId,
      status: "error",
      verifiedAt: null,
      errorMessage: message,
    };
  }

  try {
    await input.verifier.verify({
      environment: account.environment,
      secretReference: secret.secret_ref,
    });
    const verifiedAt = Date.now();
    await updateAccountStatus(client, input.accountConnectionId, "connected", null, verifiedAt);
    await recordStatusTransition(client, account.workspace_id, account.id, account.status, "connected");
    return {
      accountConnectionId: input.accountConnectionId,
      status: "connected",
      verifiedAt,
      errorMessage: null,
    };
  } catch {
    const message = "Account verification failed";
    await updateAccountStatus(client, input.accountConnectionId, "error", message, null);
    await recordStatusTransition(client, account.workspace_id, account.id, account.status, "error", message);
    return {
      accountConnectionId: input.accountConnectionId,
      status: "error",
      verifiedAt: null,
      errorMessage: message,
    };
  }
}

async function recordStatusTransition(
  client: WorkerClient,
  workspaceId: string,
  accountConnectionId: string,
  previousStatus: "pending" | "connected" | "disabled" | "error",
  nextStatus: "connected" | "error",
  reason?: string,
) {
  if (previousStatus === nextStatus) return;
  await recordWorkerAuditEvent(client, {
    workspaceId,
    eventType: "binance_account_status_changed",
    resourceType: "binance_account_connection",
    resourceId: accountConnectionId,
    metadata: {
      previous_status: previousStatus,
      next_status: nextStatus,
      ...(reason ? { reason } : {}),
    },
  });
}

async function updateAccountStatus(
  client: WorkerClient,
  accountConnectionId: string,
  status: "connected" | "error",
  errorMessage: string | null,
  verifiedAt: number | null,
) {
  const { error } = await client
    .from("binance_account_connections")
    .update({
      status,
      last_error: errorMessage,
      last_verified_at: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    })
    .eq("id", accountConnectionId);
  if (error) throw new Error(`Unable to update account connection: ${error.message}`);
}
