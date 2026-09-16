create type public.execution_worker_status as enum ('healthy', 'degraded', 'offline');

create table public.execution_worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_connection_id uuid not null references public.binance_account_connections(id) on delete cascade,
  worker_name text not null,
  status public.execution_worker_status not null,
  observed_at timestamptz not null,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, account_connection_id, worker_name)
);

create index execution_worker_heartbeats_workspace_idx
  on public.execution_worker_heartbeats(workspace_id, observed_at desc);

alter table public.execution_worker_heartbeats enable row level security;

create policy "Members can view execution worker heartbeats"
  on public.execution_worker_heartbeats for select
  using (public.is_workspace_member(workspace_id));

revoke all on public.execution_worker_heartbeats from anon, authenticated;
grant select on public.execution_worker_heartbeats to authenticated;
grant all on public.execution_worker_heartbeats to service_role;

create trigger execution_worker_heartbeat_workspace_consistency
  before insert or update on public.execution_worker_heartbeats
  for each row execute function public.assert_live_workspace_consistency();
