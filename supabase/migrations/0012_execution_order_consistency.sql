create or replace function public.assert_live_workspace_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_workspace_id uuid;
  related_account_id uuid;
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
  elsif tg_table_name in ('reconciliation_snapshots', 'execution_worker_heartbeats') then
    select workspace_id into related_workspace_id from public.binance_account_connections where id = new.account_connection_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Account does not belong to live-control workspace';
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
  elsif tg_table_name = 'execution_orders' then
    select workspace_id, account_connection_id
      into related_workspace_id, related_account_id
      from public.execution_intents
      where id = new.execution_intent_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Intent does not belong to order workspace';
    end if;
    if related_account_id <> new.account_connection_id then
      raise exception 'Order account does not match intent account';
    end if;
  elsif tg_table_name = 'execution_fills' then
    select workspace_id, account_connection_id
      into related_workspace_id, related_account_id
      from public.execution_orders
      where id = new.execution_order_id;
    if related_workspace_id is null or related_workspace_id <> new.workspace_id then
      raise exception 'Order does not belong to fill workspace';
    end if;
    if related_account_id <> new.account_connection_id then
      raise exception 'Fill account does not match order account';
    end if;
  end if;
  return new;
end;
$$;

create trigger execution_orders_workspace_consistency
  before insert or update on public.execution_orders
  for each row execute function public.assert_live_workspace_consistency();

create trigger execution_fills_workspace_consistency
  before insert or update on public.execution_fills
  for each row execute function public.assert_live_workspace_consistency();
