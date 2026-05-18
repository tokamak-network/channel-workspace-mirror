alter table indexer_runtime_config
  drop constraint if exists indexer_runtime_config_batch_size_positive;

alter table indexer_runtime_config
  drop column if exists observer_batch_size;
