alter table indexer_runtime_config
  add column if not exists observer_cost_profile text not null default 'performance',
  add column if not exists observer_page_cache_ttl_seconds integer,
  add column if not exists observer_api_cache_ttl_seconds integer,
  add column if not exists observer_sync_min_interval_seconds integer,
  add column if not exists observer_default_list_mode text,
  add column if not exists observer_event_list_limit integer,
  add column if not exists observer_include_participant_accounting text,
  add column if not exists observer_include_incident_history text,
  add column if not exists observer_npm_version_cache_ttl_seconds integer;

alter table indexer_runtime_config
  drop constraint if exists indexer_runtime_config_observer_cost_profile_valid,
  drop constraint if exists indexer_runtime_config_observer_page_cache_ttl_positive,
  drop constraint if exists indexer_runtime_config_observer_api_cache_ttl_positive,
  drop constraint if exists indexer_runtime_config_observer_sync_min_interval_positive,
  drop constraint if exists indexer_runtime_config_observer_default_list_mode_valid,
  drop constraint if exists indexer_runtime_config_observer_event_list_limit_positive,
  drop constraint if exists indexer_runtime_config_observer_participant_accounting_valid,
  drop constraint if exists indexer_runtime_config_observer_incident_history_valid,
  drop constraint if exists indexer_runtime_config_observer_npm_version_cache_ttl_positive;

alter table indexer_runtime_config
  add constraint indexer_runtime_config_observer_cost_profile_valid
    check (observer_cost_profile in ('cost', 'balanced', 'performance')),
  add constraint indexer_runtime_config_observer_page_cache_ttl_positive
    check (observer_page_cache_ttl_seconds is null or observer_page_cache_ttl_seconds > 0),
  add constraint indexer_runtime_config_observer_api_cache_ttl_positive
    check (observer_api_cache_ttl_seconds is null or observer_api_cache_ttl_seconds > 0),
  add constraint indexer_runtime_config_observer_sync_min_interval_positive
    check (observer_sync_min_interval_seconds is null or observer_sync_min_interval_seconds > 0),
  add constraint indexer_runtime_config_observer_default_list_mode_valid
    check (observer_default_list_mode is null or observer_default_list_mode in ('none', 'section_only', 'all')),
  add constraint indexer_runtime_config_observer_event_list_limit_positive
    check (observer_event_list_limit is null or observer_event_list_limit > 0),
  add constraint indexer_runtime_config_observer_participant_accounting_valid
    check (observer_include_participant_accounting is null or observer_include_participant_accounting in ('false', 'section_only', 'always')),
  add constraint indexer_runtime_config_observer_incident_history_valid
    check (observer_include_incident_history is null or observer_include_incident_history in ('none', 'active_only', 'full')),
  add constraint indexer_runtime_config_observer_npm_version_cache_ttl_positive
    check (observer_npm_version_cache_ttl_seconds is null or observer_npm_version_cache_ttl_seconds > 0);
