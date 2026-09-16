export type ExecutionSubmission = {
  accountConnectionId: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  reduceOnly: true;
};

export type ExecutionAdapter = {
  submitOrder(order: ExecutionSubmission): Promise<never>;
};

export function createDisabledExecutionAdapter(): ExecutionAdapter {
  return {
    async submitOrder() {
      throw new Error("Signed Binance order execution is disabled");
    },
  };
}
