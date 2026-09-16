# Validation worker contract

The validation worker is a separate long-running process. It must not run inside a Vercel request or a browser session.

## Queue lifecycle

1. Call `claim_next_validation_run()` with a server-only Supabase service-role client.
2. The database atomically changes one `queued` run to `running`, preventing duplicate claims across workers.
3. Load the strategy configuration and the requested `parameters`.
4. Use the run type to select the paper-trading or historical-data engine.
5. Persist either metrics in `results` and `completed_at`, or a safe diagnostic in `error_message` with `failed` status.
6. Use `complete_validation_run(run_id, run_results)` or `fail_validation_run(run_id, failure_message)` for the terminal transition. Both functions only transition a currently `running` run and are service-role-only.

The worker must be idempotent, preserve the tenant and strategy IDs from the claimed row, and never place Binance orders. Live execution requires a separate risk-approved execution service and is intentionally outside this contract.

## Required environment

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The service-role key belongs only in the worker deployment secret store. It must never be included in browser bundles, request payloads, logs, or repository files.

## Result contract

`strategy_runs.results` should contain a versioned object like:

```json
{
  "version": 1,
  "metrics": {
    "netPnl": 0,
    "totalReturnPct": 0,
    "maxDrawdownPct": 0,
    "winRatePct": 0,
    "profitFactor": 0,
    "tradeCount": 0,
    "fees": 0,
    "funding": 0
  }
}
```

Metrics must be calculated from actual historical candles or live streamed paper-trading events. The worker must not populate successful results from placeholders or predicted values.

Historical backtests should request explicit candle timestamps through the authenticated market-data boundary. Requests are bounded to a 90-day range and a maximum of 1,500 candles; workers should paginate deliberately rather than issuing unbounded data requests.

Queued runs use normalized parameters: `symbol`, `interval`, `initialEquity`, `feeRateBps`, and `slippageBps`. Backtests additionally require `startTime` and `endTime`; the API rejects missing or non-reproducible ranges before queue insertion.

The pure `runLongOnlyBacktest` core accepts real normalized candles plus a strategy signal callback. It marks equity to market on every candle, applies entry/exit slippage and fees, caps notional by leverage and optional position size, and force-closes at the end of the dataset. It is a simulation helper only and cannot place Binance orders.
