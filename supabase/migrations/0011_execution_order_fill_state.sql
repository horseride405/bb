create type public.execution_order_status as enum (
  'pending',
  'submitted',
  'partially_filled',
  'filled',
  'cancelled',
  'rejected'
);

create table public.execution_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_intent_id uuid not null references public.execution_intents(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  client_order_id text not null unique,
  exchange_order_id text,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  order_type text not null check (order_type in ('market', 'limit')),
  quantity numeric(24, 8) not null check (quantity > 0),
  reduce_only boolean not null default true,
  status public.execution_order_status not null default 'pending',
  rejection_reason text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.execution_fills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_order_id uuid not null references public.execution_orders(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  exchange_trade_id text not null,
  price numeric(24, 8) not null check (price > 0),
  quantity numeric(24, 8) not null check (quantity > 0),
  fee numeric(24, 8) not null default 0 check (fee >= 0),
  fee_asset text,
  executed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (account_connection_id, exchange_trade_id)
);

create index execution_orders_workspace_id_idx
  on public.execution_orders(workspace_id, created_at desc);
create index execution_fills_workspace_id_idx
  on public.execution_fills(workspace_id, executed_at desc);

alter table public.execution_orders enable row level security;
alter table public.execution_fills enable row level security;

create policy "Members can view execution orders"
  on public.execution_orders for select
  using (public.is_workspace_member(workspace_id));

create policy "Members can view execution fills"
  on public.execution_fills for select
  using (public.is_workspace_member(workspace_id));

revoke all on public.execution_orders from anon, authenticated;
revoke all on public.execution_fills from anon, authenticated;
grant select on public.execution_orders to authenticated;
grant select on public.execution_fills to authenticated;
grant all on public.execution_orders to service_role;
grant all on public.execution_fills to service_role;
