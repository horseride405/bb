create type public.billing_plan as enum ('starter', 'pro', 'enterprise');
create type public.billing_subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan public.billing_plan not null default 'starter',
  status public.billing_subscription_status not null default 'trialing',
  provider_customer_ref text,
  provider_subscription_ref text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_usage_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  validation_runs integer not null default 0 check (validation_runs >= 0),
  active_strategies integer not null default 0 check (active_strategies >= 0),
  connected_accounts integer not null default 0 check (connected_accounts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, period_start, period_end)
);

alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_usage_periods enable row level security;

create policy "Members can view workspace subscription"
  on public.workspace_subscriptions for select
  using (public.is_workspace_member(workspace_id));

create policy "Admins can manage workspace subscription metadata"
  on public.workspace_subscriptions for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Members can view workspace usage"
  on public.workspace_usage_periods for select
  using (public.is_workspace_member(workspace_id));

revoke all on public.workspace_usage_periods from anon, authenticated;
grant select on public.workspace_usage_periods to authenticated;
revoke all on public.workspace_subscriptions from anon, authenticated;
grant select on public.workspace_subscriptions to authenticated;
