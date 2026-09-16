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
- `GET/POST /api/strategies/:id/runs` lists or queues paper/backtest validation runs; a worker will process queued runs in a later slice.
- `GET /api/market-data/candles` fetches normalized public Binance Futures candles for authenticated paper/backtest clients.

Queued runs are claimed atomically through `claim_next_validation_run()` by a separate worker process. The worker contract is documented in `workers/validation/README.md`; it never places live Binance orders.

## Safety boundary

Live trading must remain disabled until tenant isolation, encrypted API credentials, paper-trading validation, risk limits, reconciliation, audit logs, and an emergency kill switch are implemented and tested.
