alter table observer_channels
  add column if not exists dapp_manager text,
  add column if not exists channel_deployer text,
  add column if not exists bridge_core_implementation text,
  add column if not exists bridge_token_vault_implementation text,
  add column if not exists current_join_toll text,
  add column if not exists current_root_vector_hash text,
  add column if not exists current_state_refreshed_at timestamptz;
