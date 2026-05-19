alter table indexer_runtime_config
  drop constraint if exists indexer_runtime_config_observer_interval_positive;

alter table indexer_runtime_config
  drop column if exists observer_sync_interval_seconds;
