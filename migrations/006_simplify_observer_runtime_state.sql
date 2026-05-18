alter table indexer_runtime_config
  drop column if exists rpc_provider,
  drop column if exists mirror_enabled,
  drop column if exists observer_enabled,
  drop column if exists mirror_output_dir;

drop table if exists observer_raw_history_import_state;

create table observer_raw_history_import_state (
  chain_id bigint not null,
  channel_id text not null,
  file_key text not null,
  entries_processed integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (chain_id, channel_id, file_key)
);

alter table observer_events
  drop column if exists ingestion_sources;

drop table if exists observer_blocks;
