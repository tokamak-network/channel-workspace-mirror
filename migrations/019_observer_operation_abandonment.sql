alter table observer_channels
  add column if not exists join_toll_burn_address text,
  add column if not exists channel_operation_abandoned_at timestamptz;
