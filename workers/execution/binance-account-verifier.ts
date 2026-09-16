import { createHmac } from "node:crypto";

import type { AccountVerifier } from "@/workers/execution/account-validation";
import type { SecretReferenceResolver } from "@/workers/execution/secret-manager";

const endpoints = {
  testnet: "https://testnet.binancefuture.com",
  mainnet: "https://fapi.binance.com",
} as const;

export function createBinanceAccountVerifier(
  resolver: SecretReferenceResolver,
  fetchImpl: typeof fetch = fetch,
): AccountVerifier {
  return {
    async verify(input) {
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
          {
            signal: controller.signal,
            headers: {
              accept: "application/json",
              "X-MBX-APIKEY": credentials.apiKey,
            },
          },
        );
        if (!response.ok) throw new Error(`Binance account verification failed with status ${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
