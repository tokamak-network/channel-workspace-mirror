alter table indexer_runtime_config
  add column if not exists observer_rpc_timeout_ms integer not null default 120000;

alter table indexer_runtime_config
  drop constraint if exists indexer_runtime_config_observer_rpc_timeout_positive;

alter table indexer_runtime_config
  add constraint indexer_runtime_config_observer_rpc_timeout_positive
    check (observer_rpc_timeout_ms > 0);
