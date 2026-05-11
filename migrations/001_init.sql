create table if not exists mirror_publish_history (
  id bigserial primary key,
  chain_id bigint not null,
  channel_id text not null,
  channel_name text,
  checkpoint_block bigint not null,
  recovery_root_vector_hash text not null,
  manifest_path text not null,
  public_manifest_path text not null,
  manifest_blob_url text not null,
  checkpoint_path text not null,
  public_checkpoint_path text not null,
  checkpoint_blob_url text not null,
  checkpoint_sha256 text not null,
  checkpoint_size_bytes bigint not null,
  delta_bundles jsonb not null default '[]'::jsonb,
  leader text not null,
  published_at timestamptz not null default now()
);

create unique index if not exists mirror_publish_history_channel_checkpoint_unique
  on mirror_publish_history (chain_id, channel_id, checkpoint_block);

create index if not exists mirror_publish_history_channel_checkpoint_idx
  on mirror_publish_history (chain_id, channel_id, checkpoint_block desc);

create index if not exists mirror_publish_history_published_at_idx
  on mirror_publish_history (published_at);

create index if not exists mirror_publish_history_public_manifest_path_idx
  on mirror_publish_history (public_manifest_path);

create index if not exists mirror_publish_history_public_checkpoint_path_idx
  on mirror_publish_history (public_checkpoint_path);
