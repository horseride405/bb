export type TrailingExitOptions = {
  trailingStopLossPct?: number;
  trailingTakeProfitPct?: number;
  trailingTakeProfitActivationPct?: number;
};

export type TrailingState = {
  favorablePrice: number;
  takeProfitArmed: boolean;
};

export function validateTrailingExitOptions(options: TrailingExitOptions) {
  for (const [name, value] of [
    ["trailingStopLossPct", options.trailingStopLossPct],
    ["trailingTakeProfitPct", options.trailingTakeProfitPct],
    ["trailingTakeProfitActivationPct", options.trailingTakeProfitActivationPct],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 100)) {
      throw new Error(`${name} must be between 0 and 100`);
    }
  }
  if (
    options.trailingTakeProfitPct !== undefined &&
    options.trailingTakeProfitActivationPct === undefined
  ) {
    throw new Error("Trailing take-profit activation is required when trailing take-profit is enabled");
  }
}

export function createTrailingState(entryPrice: number): TrailingState {
  return { favorablePrice: entryPrice, takeProfitArmed: false };
}

export function evaluateTrailingExit(
  side: "long" | "short",
  candle: { high: number; low: number },
  entryPrice: number,
  state: TrailingState,
  options: TrailingExitOptions,
): { reason: "trailing_stop_loss" | "trailing_take_profit"; price: number } | null {
  const favorableMovePct =
    side === "long"
      ? ((candle.high - entryPrice) / entryPrice) * 100
      : ((entryPrice - candle.low) / entryPrice) * 100;
  if (
    options.trailingTakeProfitPct !== undefined &&
    options.trailingTakeProfitActivationPct !== undefined &&
    favorableMovePct >= options.trailingTakeProfitActivationPct
  ) {
    state.takeProfitArmed = true;
  }
  state.favorablePrice =
    side === "long"
      ? Math.max(state.favorablePrice, candle.high)
      : Math.min(state.favorablePrice, candle.low);

  const stopPrice =
    options.trailingStopLossPct === undefined
      ? null
      : side === "long"
        ? state.favorablePrice * (1 - options.trailingStopLossPct / 100)
        : state.favorablePrice * (1 + options.trailingStopLossPct / 100);
  const takeProfitPrice =
    state.takeProfitArmed && options.trailingTakeProfitPct !== undefined
      ? side === "long"
        ? state.favorablePrice * (1 - options.trailingTakeProfitPct / 100)
        : state.favorablePrice * (1 + options.trailingTakeProfitPct / 100)
      : null;
  const stopTriggered =
    stopPrice !== null && (side === "long" ? candle.low <= stopPrice : candle.high >= stopPrice);
  const takeProfitTriggered =
    takeProfitPrice !== null &&
    (side === "long" ? candle.low <= takeProfitPrice : candle.high >= takeProfitPrice);

  if (stopTriggered) return { reason: "trailing_stop_loss", price: stopPrice };
  if (takeProfitTriggered) return { reason: "trailing_take_profit", price: takeProfitPrice };
  return null;
}
