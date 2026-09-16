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

The worker uses `lib/supabase/service.ts`, which disables session persistence and is not imported by browser or Next.js route code.

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

Completed worker results also include `validationConfig`, which records the selected template, position mode, trailing-exit settings, leverage/notional limits, liquidation-distance policy, trade-frequency cap, and entry cooldown used for that run. This makes stored validation evidence reproducible even if the workspace policy or strategy draft changes later.

Historical backtests should request explicit candle timestamps through the authenticated market-data boundary. Requests are bounded to a 90-day range; the worker paginates Binance's 1,500-candle response limit deliberately, deduplicates pages, and rejects pagination that stops making progress.

Queued runs use normalized parameters: `symbol`, `interval`, `initialEquity`, `feeRateBps`, and `slippageBps`. Backtests additionally require `startTime` and `endTime`; the API rejects missing or non-reproducible ranges before queue insertion.

The pure `runBacktest` core accepts real normalized candles plus a strategy signal callback that may return `long`, `short`, or `flat`. It maintains one net position per symbol, closes and reverses explicitly when the signal side changes, marks equity to market on every candle, applies direction-aware entry/exit slippage and fees, caps absolute notional by leverage and optional position size, and force-closes at the end of the dataset. It is a simulation helper only and cannot place Binance orders.

Strategies can configure `trailingStopLossPct`, `trailingTakeProfitPct`, and `trailingTakeProfitActivationPct`. Long positions trail from the highest favorable candle price and short positions from the lowest; liquidation is checked first, then trailing stop-loss, then trailing take-profit, followed by signal exits. Trigger prices include adverse exit slippage and fees, and trades persist explicit trailing exit reasons. Candle OHLC data cannot reveal intrabar order, so stop-loss wins when both trailing exits are touched in one candle.

`createTemplateSignal` supplies no-lookahead callbacks for the current Momentum, Mean Reversion, and Breakout templates. Each stored strategy can select `bidirectional`, `long-only`, or `short-only`; the worker passes that position mode into both paper and historical validation. It then persists only the resulting metrics and trade data.

`runHistoricalBacktest` is the worker-facing composition boundary: it fetches the complete bounded window through paginated Binance candle requests, selects the template signal, runs the simulator, and returns versioned metadata plus metrics. Invoke it only after a queue claim; never call it from a browser or a Vercel request handler.

`workers/validation/runner.ts` provides the first queue loop. `processNextValidationRun()` claims one run, loads its strategy and workspace risk policy, executes bounded paper sessions or historical backtests, and finalizes the run. Paper sessions default to 60 seconds and remain bounded by the normalized `durationMs` parameter.

Completed backtests and paper sessions persist timestamped equity curves and closed-trade records alongside metrics. Historical backtests and live-data paper sessions fetch real Binance funding-rate history and apply direction-aware funding payments to open long/short positions. Both modes model a conservative maintenance-margin liquidation threshold, fail entries that violate the workspace minimum liquidation distance, and record liquidation exits distinctly. Paper callers may provide funding events explicitly; otherwise the worker fetches a bounded recent funding window and exposes the number consumed. They also include a `riskReview` comparing measured maximum drawdown and maximum UTC-day loss with the workspace policy. A passing review is evidence for the next gate only; it does not authorize live trading. Reconciliation and other execution gates remain separate requirements.

The validation dashboard shows exit-reason counts and recent trade reasons so strategy behavior can be audited instead of inferred from aggregate P&L.

The authenticated `/api/risk/validate` boundary accepts an optional long/short position side plus mark and liquidation prices. When supplied, it calculates direction-aware liquidation distance and rejects positions below `min_liquidation_distance_pct`; validation runs do not infer liquidation prices from candles.

The same boundary accepts gross and concentration exposure notionals. If omitted, gross exposure defaults to `position_notional * open_positions` and concentration exposure defaults to the current position notional. Both are bounded by the conservative policy-derived aggregate cap `max_position_notional * max_open_positions`; this is an explicit gate for one-way net long/short exposure, not a substitute for exchange account reconciliation.

Validation risk reviews also enforce the tenant `max_trades_per_hour` policy using completed trade count over the requested paper/backtest window. This catches bidirectional reversal churn before a result can be considered a passing validation.

They also enforce `min_trade_interval_seconds` using entry timestamps from completed trades. The API risk boundary accepts `seconds_since_last_trade` for the same cooldown check.

Workers check `risk_policies.kill_switch_active` after claiming a run and before loading market data. An active switch fails the claimed run explicitly and prevents both paper and historical validation from starting; the same state is returned by `/api/risk/validate` as a blocking violation.

`connectBinanceClosedCandleStream` is the public market-data input boundary for the future paper engine. It emits only closed, normalized candles and returns a cleanup function. It must run in the worker deployment, never in browser code; reconnect policy and paper-position state belong to the paper worker, and this stream never places orders.

`createPaperTradingEngine` provides the in-memory paper-position boundary for that worker. It consumes the stream's closed candles, reuses a deterministic signal callback, models fees/slippage/leverage, and exposes metrics without submitting Binance orders. Persistence, reconnect handling, stale-data checks, and a live-data paper queue remain worker responsibilities.

`startPaperTradingSession` composes those boundaries for a worker process. It forwards each closed candle to the engine, reports snapshots and stream/engine errors, and on shutdown closes any open paper position before emitting the final snapshot. The session is not a database queue worker and must not be exposed through a browser or used for live order execution.

`runPaperValidation` is the bounded worker-side orchestration helper used by the queue worker. It selects the stored template signal, runs a finite live-data session, returns versioned stream metrics, and fails safely on stream errors, aborts, stale candle gaps, or sessions with no closed candle. It does not authorize live trading or replace reconciliation controls.

`runValidationWorker` is the long-running deployment loop. It repeatedly calls `processNextValidationRun`, backs off when the queue is idle or a transient worker error occurs, and stops through an `AbortSignal`. Run it in the worker deployment, not inside Vercel request handlers; graceful shutdown should abort the loop and allow the current run to reach its own bounded completion or failure path.
