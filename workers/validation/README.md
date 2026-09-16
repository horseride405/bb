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

Historical runs also evaluate a chronological out-of-sample holdout (30% by default, configurable from 10% through 50%). The holdout begins at a candle boundary, uses the same deterministic signal and real funding inputs, and reports separate return, drawdown, and trade metrics plus up to three chronological fold summaries so in-sample performance is not presented as unseen-data evidence.

Historical runs require at least 30 candles, validate candle timestamps/prices/volume, keep candles inside the requested window, and reject gaps larger than two expected intervals before simulation. Short or incomplete datasets fail rather than producing misleading fold evidence.

Completed worker results also include `validationConfig`, which records the selected template, position mode, trailing-exit settings, leverage/notional limits, liquidation-distance policy, trade-frequency cap, and entry cooldown used for that run. This makes stored validation evidence reproducible even if the workspace policy or strategy draft changes later.

Historical backtests should request explicit candle timestamps through the authenticated market-data boundary. Requests are bounded to a 90-day range; the worker paginates Binance's 1,500-candle response limit deliberately, deduplicates pages, and rejects pagination that stops making progress.

Queued runs use normalized parameters: `symbol`, `interval`, `initialEquity`, `feeRateBps`, and `slippageBps`. Backtests additionally require `startTime` and `endTime`; the API rejects missing or non-reproducible ranges before queue insertion.

The pure `runBacktest` core accepts real normalized candles plus a strategy signal callback that may return `long`, `short`, or `flat`. It maintains one net position per symbol, closes and reverses explicitly when the signal side changes, marks equity to market on every candle, applies direction-aware entry/exit slippage and fees, caps absolute notional by leverage and optional position size, and force-closes at the end of the dataset. It is a simulation helper only and cannot place Binance orders.

Strategies can configure `trailingStopLossPct`, `trailingTakeProfitPct`, and `trailingTakeProfitActivationPct`. Long positions trail from the highest favorable candle price and short positions from the lowest; liquidation is checked first, then trailing stop-loss, then trailing take-profit, followed by signal exits. Trigger prices include adverse exit slippage and fees, and trades persist explicit trailing exit reasons. Candle OHLC data cannot reveal intrabar order, so stop-loss wins when both trailing exits are touched in one candle.

`createTemplateSignal` supplies no-lookahead callbacks for the current Momentum, Mean Reversion, and Breakout templates. Each stored strategy can select `bidirectional`, `long-only`, or `short-only`; the worker passes that position mode into both paper and historical validation. It then persists only the resulting metrics and trade data.

`runHistoricalBacktest` is the worker-facing composition boundary: it fetches the complete bounded window through paginated Binance candle requests, selects the template signal, runs the simulator, and returns versioned metadata plus metrics. Invoke it only after a queue claim; never call it from a browser or a Vercel request handler.

`workers/validation/runner.ts` provides the first queue loop. `processNextValidationRun()` claims one run, loads its strategy and workspace risk policy, executes bounded paper sessions or historical backtests, and finalizes the run. Paper sessions default to 60 seconds and remain bounded by the normalized `durationMs` parameter.

Completed backtests and paper sessions persist timestamped equity curves and closed-trade records alongside metrics. Historical backtests and live-data paper sessions fetch real Binance funding-rate history and apply direction-aware funding payments to open long/short positions. Funding events must have finite non-negative timestamps, finite rates, and strictly increasing order; historical events must also fall inside the requested window. Both modes model a conservative maintenance-margin liquidation threshold, fail entries that violate the workspace minimum liquidation distance, and record liquidation exits distinctly. Paper callers may provide funding events explicitly; otherwise the worker fetches a bounded recent funding window and exposes the number consumed. They also include a `riskReview` comparing measured maximum drawdown and maximum UTC-day loss with the workspace policy; historical results include a separate `outOfSampleRiskReview` over the unseen holdout. A passing review is evidence for the next gate only; it does not authorize live trading. Reconciliation and other execution gates remain separate requirements.

The validation dashboard shows exit-reason counts and recent trade reasons so strategy behavior can be audited instead of inferred from aggregate P&L.

Completed validation details can be exported from the dashboard as the exact worker-produced JSON result or a CSV of closed trades. Exports are browser downloads of already-authorized tenant results; they do not fetch Binance credentials or recompute metrics client-side.

## Phase 2 controlled-live boundary

Phase 2 introduces the control-plane and worker contracts for live trading, but this repository still does not submit Binance orders. Account connection metadata is tenant-scoped; secret material belongs only in a worker-side secret manager reference table that has no authenticated-client RLS access. The browser receives only account name, environment, status, and an optional API-key suffix.

Live strategy approvals are admin-controlled, account-specific, expiring, and revocable. The live emergency stop defaults active, and live trading remains disabled by default. `evaluateLiveExecutionGate()` fails closed unless the account is connected, credentials are available to the worker, approval is current, reconciliation is healthy and fresh, risk checks pass, the position is within limits, and the intent is reduce-only.

`reconcileAccountState()` compares expected and observed one-way positions and records healthy, mismatch, stale, or error snapshots through the service-role worker client. Any mismatch or stale snapshot blocks execution. `preflightLiveExecution()` returns `submitted: false` by construction; an execution adapter, exchange-side idempotency, order reconciliation, and manual production enablement are still required before real orders can exist.

`validateBinanceAccountConnection()` is a worker-only account-health boundary. It reads a secret-manager reference from the service-role-only table, passes only that reference to an injected verifier, and updates connection health. It never accepts or logs raw API keys and fails the connection when the reference is unavailable.

Approval grants, approval revocations, and emergency-stop changes are recorded through the authenticated `record_audit_event()` function. Audit metadata must contain identifiers and decision context only; never store credentials, signed requests, or full exchange payloads.

`preflightAndPersistExecutionIntent()` is the worker-only idempotency boundary for future execution. It records either `blocked` or `preflighted` intents under a unique idempotency key, rejects reuse of a key for different request fields, and returns `submitted: false` for every result. A preflighted intent is not an order and must not be sent to Binance without a separately approved execution adapter.

Database triggers reject approvals, reconciliation snapshots, and execution intents whose strategy, account, and workspace IDs do not agree. This is an additional database-side tenant boundary; worker and API callers must still pass the correct workspace IDs and treat any consistency error as a blocking failure.

`evaluateLiveControlReadiness()` provides a worker-safe control-plane readiness summary for an account/strategy pair. It reports missing enablement, active stops, unverified accounts, expired/revoked approvals, and unhealthy or stale reconciliation; it is informational and does not authorize order submission.

Reconciliation timestamps are validated as finite, non-future values. A stale snapshot is explicitly marked `stale` and includes `reconciliation_stale`; invalid timestamps produce an `error` result and must fail closed. Account-verifier failures persist only a generic error message so exchange responses cannot leak into tenant-visible state.

`persistWorkerHeartbeat()` stores a tenant/account-scoped worker signal with `healthy`, `degraded`, or `offline` classification. Heartbeats are service-role writes, visible as read-only operations data, and must not be treated as execution authorization; missing or stale signals keep the system fail-closed.

Heartbeat persistence uses `retryWithBackoff()` with bounded exponential delays and a finite attempt count. Exhausted retries remain errors; they must transition the worker to a degraded/offline signal rather than being swallowed.

Worker account verification and heartbeat status transitions write service-role audit events with identifiers and generic state metadata only. Recovery from `error`, `degraded`, or `offline` is therefore visible without storing exchange responses or credentials.

`runWorkerCycle()` wraps a reconciliation or account-health cycle and records a successful heartbeat after completion, or increments the failure count with a generic error marker before rethrowing. The wrapper preserves the operation failure for supervisors and never treats a failed cycle as healthy.

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

## Production operations checklist

- Run one or more worker processes with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` injected by the deployment secret manager.
- Keep worker concurrency bounded by the database claim function; never process a run fetched directly from an unclaimed client query.
- Restart workers on process crashes, but preserve the database run state and inspect failed diagnostics before replaying a queued run.
- Alert on repeated claim/complete/fail RPC errors, queue age, failed-run rate, stale-candle failures, and unexpected worker restarts.
- Emit structured operational logs containing run ID, workspace ID, run type, status, duration, and error category; never log service-role keys, Binance credentials, raw request headers, or full tenant payloads.
- Expose a deployment health signal from the process supervisor or platform. A healthy worker must be able to claim, process, and finalize a bounded run; health must not be inferred from an open HTTP request.
- On shutdown, stop claiming new work, abort the current bounded session, and allow its terminal failure path to complete before the process exits.
- Keep live order execution disabled until a separate execution service adds encrypted tenant credentials, reconciliation, reduce-only behavior, manual approval, and emergency shutdown controls.
