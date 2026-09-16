# ApexPilot

Multi-tenant Binance Futures strategy validation and execution platform.

## Initial scope

This first slice is the SaaS control-plane foundation:

- Next.js dashboard shell for a tenant workspace
- Supabase-ready environment contract
- Product surfaces for strategies, validation, paper trading, and risk controls
- No live order execution or custody of funds

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The first production architecture keeps the dashboard and control plane on Vercel/Supabase. Long-running Binance market-data, risk, reconciliation, and order workers will be deployed separately.

## Current API boundary

- `GET /api/workspaces` lists workspaces visible to the authenticated user.
- `POST /api/workspaces` creates a workspace and owner membership through the `create_workspace` database function.
- `GET /api/strategies` lists tenant-visible strategies.
- `POST /api/strategies` creates paper or backtest strategies; live mode is rejected until the execution safety layer is complete.
- `GET/PATCH /api/risk-policies` reads or updates admin-controlled workspace limits.
- `POST /api/risk/validate` checks proposed leverage, notional, loss, and position counts before execution.
- `GET/POST /api/strategies/:id/runs` lists or queues paper/backtest validation runs for the separate validation worker.
- `GET /api/market-data/candles` fetches normalized public Binance Futures candles for authenticated paper/backtest clients; historical requests may provide bounded `startTime` and `endTime` timestamps.
- `GET/POST /api/live/accounts` manages tenant-visible connection metadata only; raw Binance credentials are never accepted by this API.
- `POST/DELETE /api/live/approvals` manages expiring, revocable admin approvals bound to a strategy and account.
- `POST /api/live/emergency-stop` controls the admin emergency stop, which defaults active.
- `GET /api/live/operations` returns tenant-scoped live-control health for the operations dashboard.
- `GET /api/live/intents` and `GET /api/live/reconciliation` expose tenant-scoped preflight decisions and reconciliation history; neither endpoint can submit orders.
- `GET /api/live/audit` exposes tenant-scoped immutable control-history events without credential or signed-request payloads.
- `/api/live/operations` also reports worker heartbeats; stale or offline reconciliation workers remain a blocking operational condition.
- Worker heartbeat writes use bounded exponential retry and never convert exhausted persistence failures into a healthy signal.
- Worker account-health and heartbeat transitions are recorded as identifier-only audit events, including recovery transitions.
- `runWorkerCycle()` records success/failure heartbeat transitions around bounded worker operations while preserving the original operation error.
- `runWorkerSupervisor()` propagates shutdown signals, backs off repeated cycle failures, and bounds cleanup time before worker exit.
- Execution order/fill state is modeled with worker-only, tenant-consistent records and monotonic lifecycle validation; this is persistence groundwork, not Binance order submission.
- Worker fill ingestion rejects invalid/future observations, deduplicates exchange trade IDs, and audits accepted order-state transitions without calling Binance.
- Order/fill reconciliation rejects impossible aggregate quantities, and preflighted intents have an explicit cancellable lifecycle before any execution adapter exists.
- Provider-neutral secret-reference and execution-adapter contracts are present, but the default adapter fails closed on every submission; no signed Binance request exists.
- Controlled-live readiness is evaluated worker-side with explicit blockers; it is informational only and never authorizes order submission.

Queued runs are claimed atomically through `claim_next_validation_run()` by a separate worker process. `workers/validation/runner.ts` executes supported historical backtests and finalizes runs through service-role-only RPCs; it never places live Binance orders.

The `/validation` dashboard reports market-data readiness, queued-run activity, and the required backtest → paper trading → risk review pipeline.

Validation metric calculations live in `lib/validation/metrics.ts` and are intentionally independent of Binance or Supabase so the worker can test them against real engine output.

## Safety boundary

Live trading must remain disabled until tenant isolation, encrypted API credentials, paper-trading validation, risk limits, reconciliation, audit logs, and an emergency kill switch are implemented and tested. Phase 2 now has the control-plane metadata and worker contracts for these boundaries, but it still has no signed order submission.
