alter table observer_events
  add column if not exists ingestion_sources jsonb not null default '[]'::jsonb;

create table if not exists observer_event_sync_state (
  chain_id bigint not null,
  channel_id text not null,
  sync_key text not null,
  last_scanned_block bigint not null,
  latest_block bigint,
  updated_at timestamptz not null default now(),
  primary key (chain_id, channel_id, sync_key)
);

create table if not exists observer_raw_history_import_state (
  chain_id bigint not null,
  channel_id text not null,
  file_path text not null,
  entries_processed integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (chain_id, channel_id, file_path)
);

create table if not exists observer_blocks (
  chain_id bigint not null,
  block_number bigint not null,
  block_hash text not null,
  block_timestamp timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, block_number)
);

create table if not exists indexer_runtime_config (
  channel_slug text primary key,
  rpc_url text,
  rpc_provider text,
  log_requests_per_second numeric,
  block_range_cap integer,
  mirror_enabled boolean not null default true,
  observer_enabled boolean not null default true,
  mirror_publish_interval_seconds integer not null default 86400,
  observer_sync_interval_seconds integer not null default 3600,
  observer_batch_size integer not null default 2000,
  mirror_publish_account text,
  mirror_output_dir text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint indexer_runtime_config_mirror_interval_positive
    check (mirror_publish_interval_seconds > 0),
  constraint indexer_runtime_config_observer_interval_positive
    check (observer_sync_interval_seconds > 0),
  constraint indexer_runtime_config_batch_size_positive
    check (observer_batch_size > 0)
);

create table if not exists indexer_run_state (
  channel_slug text primary key,
  last_observer_run_at timestamptz,
  last_observer_success_at timestamptz,
  last_mirror_run_at timestamptz,
  last_mirror_success_at timestamptz,
  last_raw_history_dir text,
  last_checkpoint_block bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into indexer_runtime_config (channel_slug)
values ('the-great-first-channel')
on conflict (channel_slug) do nothing;

insert into indexer_run_state (channel_slug)
values ('the-great-first-channel')
on conflict (channel_slug) do nothing;
