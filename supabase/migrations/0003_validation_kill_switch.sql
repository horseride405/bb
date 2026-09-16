alter table public.risk_policies
  add column kill_switch_active boolean not null default false;
