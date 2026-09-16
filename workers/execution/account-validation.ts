import type { Database } from "@/lib/supabase/database";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id, environment")
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
    return {
      accountConnectionId: input.accountConnectionId,
      status: "connected",
      verifiedAt,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account verification failed";
    await updateAccountStatus(client, input.accountConnectionId, "error", message, null);
    return {
      accountConnectionId: input.accountConnectionId,
      status: "error",
      verifiedAt: null,
      errorMessage: message,
    };
  }
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
