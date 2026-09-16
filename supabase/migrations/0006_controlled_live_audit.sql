create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_workspace_created_idx
  on public.audit_events(workspace_id, created_at desc);

alter table public.audit_events enable row level security;

create policy "Members can view workspace audit events"
  on public.audit_events for select
  using (public.is_workspace_member(workspace_id));

create or replace function public.record_audit_event(
  target_workspace_id uuid,
  target_event_type text,
  target_resource_type text,
  target_resource_id uuid,
  target_metadata jsonb default '{}'::jsonb
)
returns setof public.audit_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace membership required';
  end if;

  return query
  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    event_type,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_workspace_id,
    auth.uid(),
    left(trim(target_event_type), 80),
    left(trim(target_resource_type), 80),
    target_resource_id,
    target_metadata
  )
  returning *;
end;
$$;

revoke execute on function public.record_audit_event(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.record_audit_event(uuid, text, text, uuid, jsonb) to authenticated;
