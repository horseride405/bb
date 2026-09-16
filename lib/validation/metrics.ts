export type TradeOutcome = {
  pnl: number;
  fees?: number;
  funding?: number;
};

export type ValidationMetrics = {
  netPnl: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  profitFactor: number | null;
  tradeCount: number;
  fees: number;
  funding: number;
};

export function calculateValidationMetrics(
  initialEquity: number,
  equityCurve: number[],
  trades: TradeOutcome[],
): ValidationMetrics {
  if (!Number.isFinite(initialEquity) || initialEquity <= 0) {
    throw new Error("Initial equity must be a positive number");
  }
  if (equityCurve.some((equity) => !Number.isFinite(equity) || equity < 0)) {
    throw new Error("Equity curve must contain non-negative finite numbers");
  }
  if (trades.some((trade) => !Number.isFinite(trade.pnl))) {
    throw new Error("Trade P&L must contain finite numbers");
  }

  const finalEquity = equityCurve.at(-1) ?? initialEquity;
  let peak = initialEquity;
  let maxDrawdownPct = 0;
  for (const equity of equityCurve) {
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
  }

  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((total, trade) => total + trade.pnl, 0);
  const grossLoss = Math.abs(
    trades.filter((trade) => trade.pnl < 0).reduce((total, trade) => total + trade.pnl, 0),
  );
  const fees = trades.reduce((total, trade) => total + (trade.fees ?? 0), 0);
  const funding = trades.reduce((total, trade) => total + (trade.funding ?? 0), 0);

  return {
    netPnl: finalEquity - initialEquity,
    totalReturnPct: ((finalEquity - initialEquity) / initialEquity) * 100,
    maxDrawdownPct,
    winRatePct: trades.length === 0 ? 0 : (trades.filter((trade) => trade.pnl > 0).length / trades.length) * 100,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / grossLoss,
    tradeCount: trades.length,
    fees,
    funding,
  };
}
