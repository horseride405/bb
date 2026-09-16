import { createHmac } from "node:crypto";

import type { SecretReferenceResolver } from "@/workers/execution/secret-manager";
import type { ReconciliationPosition } from "@/workers/execution/reconciliation";

const endpoints = {
  testnet: "https://testnet.binancefuture.com",
  mainnet: "https://fapi.binance.com",
} as const;

type BinanceEnvironment = keyof typeof endpoints;

export type BinanceAccountSnapshot = {
  observedAt: number;
  balances: Record<string, number>;
  positions: ReconciliationPosition[];
};

type BinanceResponse = Record<string, unknown>;

function recordValue(value: unknown, name: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Binance ${name} response is malformed`);
  }
  return value as BinanceResponse;
}

function numberValue(value: unknown, name: string) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`Binance ${name} value is invalid`);
  }
  return parsed;
}

export function createBinanceReconciliationClient(
  resolver: SecretReferenceResolver,
  fetchImpl: typeof fetch = fetch,
) {
  return {
    async fetchSnapshot(input: {
      environment: BinanceEnvironment;
      secretReference: string;
      now?: number;
    }): Promise<BinanceAccountSnapshot> {
      const credentials = await resolver.resolve({
        provider: "binance",
        reference: input.secretReference,
      });
      if (!credentials.apiKey || !credentials.apiSecret) {
        throw new Error("Binance credentials are incomplete");
      }

      const query = `timestamp=${Date.now()}&recvWindow=5000`;
      const signature = createHmac("sha256", credentials.apiSecret)
        .update(query)
        .digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetchImpl(
          `${endpoints[input.environment]}/fapi/v2/account?${query}&signature=${signature}`,
          { signal: controller.signal, headers: { accept: "application/json", "X-MBX-APIKEY": credentials.apiKey } },
        );
        if (!response.ok) throw new Error(`Binance account snapshot failed with status ${response.status}`);
        const account = recordValue(await response.json(), "account");
        const positionsResponse = await fetchImpl(
          `${endpoints[input.environment]}/fapi/v2/positionRisk?${query}&signature=${signature}`,
          { signal: controller.signal, headers: { accept: "application/json", "X-MBX-APIKEY": credentials.apiKey } },
        );
        if (!positionsResponse.ok) throw new Error(`Binance position snapshot failed with status ${positionsResponse.status}`);
        const positionsPayload = await positionsResponse.json();
        if (!Array.isArray(positionsPayload)) throw new Error("Binance positions response is malformed");

        const balances: Record<string, number> = {};
        if (!Array.isArray(account.assets)) throw new Error("Binance balances response is malformed");
        for (const asset of account.assets) {
          const entry = recordValue(asset, "balance");
          balances[String(entry.asset)] = numberValue(entry.walletBalance, "wallet balance");
        }

        const positions = positionsPayload
          .map((value) => recordValue(value, "position"))
          .filter((entry) => numberValue(entry.positionAmt, "position amount") !== 0)
          .map((entry) => {
            const quantity = numberValue(entry.positionAmt, "position amount");
            return {
              symbol: String(entry.symbol),
              side: quantity > 0 ? "long" as const : "short" as const,
              quantity: Math.abs(quantity),
              entryPrice: numberValue(entry.entryPrice, "entry price"),
            };
          });

        return {
          observedAt: input.now ?? Date.now(),
          balances,
          positions,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
