create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'viewer',
  token_digest text not null,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_invitations_workspace_idx
  on public.workspace_invitations(workspace_id, created_at desc);

create unique index workspace_invitations_pending_email_idx
  on public.workspace_invitations(workspace_id, lower(email))
  where accepted_at is null;

create table public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.workspace_invitations enable row level security;
alter table public.billing_provider_events enable row level security;

create policy "Admins can manage workspace invitations"
  on public.workspace_invitations for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

revoke all on public.billing_provider_events from anon, authenticated;
grant all on public.billing_provider_events to service_role;
