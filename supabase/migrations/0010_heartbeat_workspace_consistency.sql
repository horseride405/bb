create or replace function public.assert_live_workspace_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_workspace_id uuid;
begin
  if tg_table_name = 'live_strategy_approvals' then
    select workspace_id into related_workspace_id from public.strategies where id = new.strategy_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Strategy does not belong to approval workspace';
    end if;
    select workspace_id into related_workspace_id from public.binance_account_connections where id = new.account_connection_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Account does not belong to approval workspace';
    end if;
  elsif tg_table_name = 'reconciliation_snapshots' then
    select workspace_id into related_workspace_id from public.binance_account_connections where id = new.account_connection_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Account does not belong to reconciliation workspace';
    end if;
  elsif tg_table_name = 'execution_intents' then
    select workspace_id into related_workspace_id from public.strategies where id = new.strategy_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Strategy does not belong to intent workspace';
    end if;
    select workspace_id into related_workspace_id from public.binance_account_connections where id = new.account_connection_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Account does not belong to intent workspace';
    end if;
  elsif tg_table_name = 'execution_worker_heartbeats' then
    select workspace_id into related_workspace_id from public.binance_account_connections where id = new.account_connection_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Account does not belong to heartbeat workspace';
    end if;
  end if;
  return new;
end;
$$;
