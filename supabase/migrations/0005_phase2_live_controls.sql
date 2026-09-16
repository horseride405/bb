create type public.binance_account_environment as enum ('testnet', 'mainnet');
create type public.binance_account_status as enum ('pending', 'connected', 'disabled', 'error');
create type public.reconciliation_status as enum ('healthy', 'mismatch', 'stale', 'error');
create type public.execution_intent_status as enum ('pending', 'blocked', 'preflighted', 'cancelled');

alter table public.risk_policies
  add column live_emergency_stop_active boolean not null default true;

create table public.binance_account_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  environment public.binance_account_environment not null default 'testnet',
  status public.binance_account_status not null default 'pending',
  api_key_last4 text,
  last_verified_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  check (api_key_last4 is null or api_key_last4 ~ '^[A-Za-z0-9]{4}$')
);

create table public.binance_account_secrets (
  account_connection_id uuid primary key references public.binance_account_connections(id) on delete cascade,
  secret_ref text not null,
  created_at timestamptz not null default now()
);

create table public.live_strategy_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (strategy_id, account_connection_id)
);

create table public.reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  observed_at timestamptz not null,
  status public.reconciliation_status not null,
  balances jsonb not null default '{}'::jsonb,
  positions jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.execution_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  idempotency_key text not null unique,
  side text not null check (side in ('long', 'short', 'flat')),
  reduce_only boolean not null default false,
  position_notional numeric(18, 2) not null check (position_notional >= 0),
  status public.execution_intent_status not null default 'pending',
  risk_snapshot jsonb not null default '{}'::jsonb,
  blocked_reasons jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index binance_account_connections_workspace_id_idx
  on public.binance_account_connections(workspace_id);
create index live_strategy_approvals_workspace_id_idx
  on public.live_strategy_approvals(workspace_id);
create index reconciliation_snapshots_account_id_idx
  on public.reconciliation_snapshots(account_connection_id, observed_at desc);
create index execution_intents_workspace_id_idx
  on public.execution_intents(workspace_id, created_at desc);

alter table public.binance_account_connections enable row level security;
alter table public.binance_account_secrets enable row level security;
alter table public.live_strategy_approvals enable row level security;
alter table public.reconciliation_snapshots enable row level security;
alter table public.execution_intents enable row level security;

create policy "Members can view account connection metadata"
  on public.binance_account_connections for select
  using (public.is_workspace_member(workspace_id));

create policy "Admins can manage account connection metadata"
  on public.binance_account_connections for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Members can view live approvals"
  on public.live_strategy_approvals for select
  using (public.is_workspace_member(workspace_id));

create policy "Admins can manage live approvals"
  on public.live_strategy_approvals for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Members can view reconciliation snapshots"
  on public.reconciliation_snapshots for select
  using (public.is_workspace_member(workspace_id));

create policy "Members can view execution intents"
  on public.execution_intents for select
  using (public.is_workspace_member(workspace_id));

revoke all on public.binance_account_secrets from anon, authenticated;
grant all on public.binance_account_secrets to service_role;
