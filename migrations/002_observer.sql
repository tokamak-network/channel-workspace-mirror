create table if not exists observer_channels (
  chain_id bigint not null,
  channel_id text not null,
  slug text not null unique,
  name text not null,
  dapp_id bigint not null,
  genesis_block bigint not null,
  bridge_core text not null,
  channel_manager text not null,
  bridge_token_vault text not null,
  canonical_asset text,
  controller text,
  l2_accounting_vault text,
  leader text,
  dapp_metadata_digest_schema text,
  dapp_metadata_digest text,
  function_root text,
  groth_verifier text,
  groth_verifier_version text,
  tokamak_verifier text,
  tokamak_verifier_version text,
  source_code_url text,
  abi_url text,
  admin_wallet text,
  incident_notice text,
  dapp_manager text,
  channel_deployer text,
  bridge_core_implementation text,
  bridge_token_vault_implementation text,
  current_join_toll text,
  current_root_vector_hash text,
  current_state_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chain_id, channel_id)
);

create table if not exists observer_sync_state (
  chain_id bigint not null,
  channel_id text not null,
  last_scanned_block bigint not null,
  latest_block bigint,
  updated_at timestamptz not null default now(),
  primary key (chain_id, channel_id)
);

create table if not exists observer_events (
  id bigserial primary key,
  chain_id bigint not null,
  channel_id text not null,
  block_number bigint not null,
  block_hash text not null,
  block_timestamp timestamptz,
  transaction_hash text not null,
  transaction_index integer not null,
  log_index integer not null,
  contract_address text not null,
  event_name text not null,
  event_group text not null,
  decoded jsonb not null default '{}'::jsonb,
  raw_topics jsonb not null default '[]'::jsonb,
  raw_data text not null,
  observed_at timestamptz not null default now(),
  unique (chain_id, channel_id, transaction_hash, log_index)
);

create index if not exists observer_events_channel_block_idx
  on observer_events (chain_id, channel_id, block_number desc, log_index desc);

create index if not exists observer_events_channel_group_block_idx
  on observer_events (chain_id, channel_id, event_group, block_number desc, log_index desc);

create index if not exists observer_events_channel_event_block_idx
  on observer_events (chain_id, channel_id, event_name, block_number desc, log_index desc);
