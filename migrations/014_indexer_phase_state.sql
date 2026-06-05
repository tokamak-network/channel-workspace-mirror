create table if not exists indexer_phase_state (
  channel_slug text not null,
  phase text not null,
  status text not null,
  started_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  latest_block bigint,
  last_scanned_block bigint,
  checkpoint_block bigint,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (channel_slug, phase),
  constraint indexer_phase_state_status_valid
    check (status in ('running', 'succeeded', 'failed', 'skipped'))
);

create index if not exists indexer_phase_state_channel_updated_idx
  on indexer_phase_state (channel_slug, updated_at desc);
