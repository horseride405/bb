create or replace function public.reject_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit events are immutable';
end;
$$;

create trigger audit_events_immutable_update
  before update on public.audit_events
  for each row execute function public.reject_audit_event_mutation();

create trigger audit_events_immutable_delete
  before delete on public.audit_events
  for each row execute function public.reject_audit_event_mutation();

revoke update, delete on public.audit_events from anon, authenticated;
