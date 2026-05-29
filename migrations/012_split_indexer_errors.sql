alter table indexer_run_state
  add column if not exists last_observer_error text,
  add column if not exists last_mirror_error text;
