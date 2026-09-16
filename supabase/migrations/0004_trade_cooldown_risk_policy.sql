alter table public.risk_policies
  add column min_trade_interval_seconds integer not null default 60
    check (min_trade_interval_seconds >= 0 and min_trade_interval_seconds <= 86400);
