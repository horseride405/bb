# Worker deployment

The validation worker is a separate long-running process. Deploy it independently
from Vercel and inject these values through the platform secret manager:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BINANCE_FUTURES_API_BASE_URL` (optional; defaults to Binance production public API)
- `BINANCE_FUTURES_WS_BASE_URL` (optional; defaults to Binance production public stream)

Start it with:

```bash
npm ci
npm run worker:validation
```

The worker validates required configuration before starting, claims runs through
the atomic Supabase RPC, and handles `SIGINT`/`SIGTERM` with an abort signal.
Do not expose `SUPABASE_SERVICE_ROLE_KEY` to Vercel browser code, API payloads,
logs, or repository files.

This worker processes paper and historical validation only. Signed Binance order
submission remains disabled. A future execution worker must be deployed
separately with an approved secret-manager binding, reconciliation, idempotency,
failure-injection evidence, and explicit production approval.

The repository now includes a worker-only `createBinanceAccountVerifier()` for
signed account-health checks against Binance Futures testnet or mainnet. It
resolves credentials through the injected `SecretReferenceResolver`, never
accepts credentials from a browser request, and does not submit orders. Use
testnet first and keep withdrawal permission disabled.

Use one worker instance initially, configure automatic restart on process failure,
and use the platform's process supervisor for liveness. The worker does not expose
an HTTP health endpoint; liveness must not be inferred from a Vercel request or
browser connection.
