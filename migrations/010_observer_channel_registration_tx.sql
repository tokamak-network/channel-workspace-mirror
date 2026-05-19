alter table observer_channels
  add column if not exists channel_registration_tx text;
