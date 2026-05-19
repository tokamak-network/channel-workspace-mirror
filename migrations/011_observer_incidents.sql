create table if not exists observer_incidents (
  id bigserial primary key,
  chain_id bigint not null,
  channel_id text not null,
  status text not null default 'active',
  severity text not null default 'info',
  title text not null,
  body text not null,
  reference_url text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observer_incidents_status_check check (status in ('active', 'resolved')),
  constraint observer_incidents_severity_check check (severity in ('info', 'warning', 'critical'))
);

create index if not exists observer_incidents_channel_status_idx
  on observer_incidents (chain_id, channel_id, status, opened_at desc, id desc);

create index if not exists observer_incidents_channel_opened_idx
  on observer_incidents (chain_id, channel_id, opened_at desc, id desc);
