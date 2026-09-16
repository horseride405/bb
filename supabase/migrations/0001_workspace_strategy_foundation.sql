create extension if not exists "pgcrypto";

create type public.workspace_role as enum ('owner', 'admin', 'trader', 'viewer');
create type public.strategy_status as enum ('draft', 'ready', 'running', 'paused', 'archived');
create type public.strategy_mode as enum ('paper', 'backtest', 'live');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  description text,
  status public.strategy_status not null default 'draft',
  mode public.strategy_mode not null default 'paper',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index strategies_workspace_id_idx on public.strategies(workspace_id);
create index workspace_members_user_id_idx on public.workspace_members(user_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.strategies enable row level security;

create policy "Members can view their workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "Members can view workspace membership"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "Members can view workspace strategies"
  on public.strategies for select
  using (public.is_workspace_member(workspace_id));

create policy "Editors can create workspace strategies"
  on public.strategies for insert
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

create policy "Editors can update workspace strategies"
  on public.strategies for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Editors can delete workspace strategies"
  on public.strategies for delete
  using (public.is_workspace_member(workspace_id));

create or replace function public.create_workspace(workspace_name text, workspace_slug text)
returns setof public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  created_workspace public.workspaces;
begin
  if (auth.uid() is null) then
    raise exception 'Authentication required';
  end if;

  insert into public.workspaces (name, slug)
  values (trim(workspace_name), lower(trim(workspace_slug)))
  returning * into created_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace.id, auth.uid(), 'owner');

  return next created_workspace;
end;
$$;

revoke execute on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;
