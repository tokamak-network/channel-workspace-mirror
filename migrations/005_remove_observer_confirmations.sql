alter table indexer_runtime_config
  drop constraint if exists indexer_runtime_config_confirmations_nonnegative;

alter table indexer_runtime_config
  drop column if exists observer_confirmations;
