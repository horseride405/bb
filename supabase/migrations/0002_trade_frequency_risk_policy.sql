alter table public.risk_policies
  add column max_trades_per_hour integer not null default 60
    check (max_trades_per_hour > 0 and max_trades_per_hour <= 1000);
