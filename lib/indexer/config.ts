import { getSql } from "../db";

export type IndexerRuntimeConfig = {
  channel_slug: string;
  rpc_url: string | null;
  log_requests_per_second: string | null;
  block_range_cap: number | null;
  observer_rpc_timeout_ms: number | null;
  observer_cost_profile: string | null;
  observer_page_cache_ttl_seconds: number | null;
  observer_api_cache_ttl_seconds: number | null;
  observer_sync_min_interval_seconds: number | null;
  observer_default_list_mode: string | null;
  observer_event_list_limit: number | null;
  observer_include_participant_accounting: string | null;
  observer_include_incident_history: string | null;
  observer_npm_version_cache_ttl_seconds: number | null;
  mirror_publish_interval_seconds: number;
  mirror_publish_account: string | null;
  updated_at: string;
  created_at: string;
};

export type IndexerRunState = {
  channel_slug: string;
  last_observer_run_at: string | null;
  last_observer_success_at: string | null;
  last_observer_error: string | null;
  last_mirror_run_at: string | null;
  last_mirror_success_at: string | null;
  last_mirror_error: string | null;
  last_raw_history_dir: string | null;
  last_checkpoint_block: string | null;
  last_error: string | null;
  updated_at: string;
};

export type IndexerRuntimeConfigInput = {
  rpcUrl?: string | null;
  logRequestsPerSecond?: number | null;
  blockRangeCap?: number | null;
  observerRpcTimeoutMs?: number | null;
  observerCostProfile?: string | null;
  observerPageCacheTtlSeconds?: number | null;
  observerApiCacheTtlSeconds?: number | null;
  observerSyncMinIntervalSeconds?: number | null;
  observerDefaultListMode?: string | null;
  observerEventListLimit?: number | null;
  observerIncludeParticipantAccounting?: string | null;
  observerIncludeIncidentHistory?: string | null;
  observerNpmVersionCacheTtlSeconds?: number | null;
  mirrorPublishIntervalSeconds?: number;
  mirrorPublishAccount?: string | null;
};

export const DEFAULT_OBSERVER_RPC_TIMEOUT_MS = 120_000;

export async function getIndexerRuntimeConfig(channelSlug: string) {
  const sql = getSql();
  const rows = await sql`
    select *
    from indexer_runtime_config
    where channel_slug = ${channelSlug}
    limit 1
  ` as IndexerRuntimeConfig[];
  return rows[0] ?? null;
}

export async function requireIndexerRuntimeConfig(channelSlug: string) {
  const config = await getIndexerRuntimeConfig(channelSlug);
  if (!config) {
    throw new Error(`Indexer runtime config is missing for channel ${channelSlug}.`);
  }
  if (!config.rpc_url) {
    throw new Error(`RPC URL is not configured for channel ${channelSlug}.`);
  }
  return config as IndexerRuntimeConfig & { rpc_url: string };
}

export async function updateIndexerRuntimeConfig(channelSlug: string, input: IndexerRuntimeConfigInput) {
  validateConfigInput(input);
  const sql = getSql();
  const rows = await sql`
    insert into indexer_runtime_config (
      channel_slug,
      rpc_url,
      log_requests_per_second,
      block_range_cap,
      observer_rpc_timeout_ms,
      observer_cost_profile,
      observer_page_cache_ttl_seconds,
      observer_api_cache_ttl_seconds,
      observer_sync_min_interval_seconds,
      observer_default_list_mode,
      observer_event_list_limit,
      observer_include_participant_accounting,
      observer_include_incident_history,
      observer_npm_version_cache_ttl_seconds,
      mirror_publish_interval_seconds,
      mirror_publish_account,
      updated_at
    )
    values (
      ${channelSlug},
      ${input.rpcUrl ?? null},
      ${input.logRequestsPerSecond == null ? null : String(input.logRequestsPerSecond)}::numeric,
      ${input.blockRangeCap == null ? null : String(input.blockRangeCap)}::integer,
      ${String(input.observerRpcTimeoutMs ?? defaultObserverRpcTimeoutMs())}::integer,
      ${input.observerCostProfile ?? "performance"},
      ${input.observerPageCacheTtlSeconds == null ? null : String(input.observerPageCacheTtlSeconds)}::integer,
      ${input.observerApiCacheTtlSeconds == null ? null : String(input.observerApiCacheTtlSeconds)}::integer,
      ${input.observerSyncMinIntervalSeconds == null ? null : String(input.observerSyncMinIntervalSeconds)}::integer,
      ${input.observerDefaultListMode ?? null},
      ${input.observerEventListLimit == null ? null : String(input.observerEventListLimit)}::integer,
      ${input.observerIncludeParticipantAccounting ?? null},
      ${input.observerIncludeIncidentHistory ?? null},
      ${input.observerNpmVersionCacheTtlSeconds == null ? null : String(input.observerNpmVersionCacheTtlSeconds)}::integer,
      ${String(input.mirrorPublishIntervalSeconds ?? 86400)}::integer,
      ${input.mirrorPublishAccount ?? null},
      now()
    )
    on conflict (channel_slug) do update set
      rpc_url = excluded.rpc_url,
      log_requests_per_second = excluded.log_requests_per_second,
      block_range_cap = excluded.block_range_cap,
      observer_rpc_timeout_ms = excluded.observer_rpc_timeout_ms,
      observer_cost_profile = excluded.observer_cost_profile,
      observer_page_cache_ttl_seconds = excluded.observer_page_cache_ttl_seconds,
      observer_api_cache_ttl_seconds = excluded.observer_api_cache_ttl_seconds,
      observer_sync_min_interval_seconds = excluded.observer_sync_min_interval_seconds,
      observer_default_list_mode = excluded.observer_default_list_mode,
      observer_event_list_limit = excluded.observer_event_list_limit,
      observer_include_participant_accounting = excluded.observer_include_participant_accounting,
      observer_include_incident_history = excluded.observer_include_incident_history,
      observer_npm_version_cache_ttl_seconds = excluded.observer_npm_version_cache_ttl_seconds,
      mirror_publish_interval_seconds = excluded.mirror_publish_interval_seconds,
      mirror_publish_account = excluded.mirror_publish_account,
      updated_at = now()
    returning *
  ` as IndexerRuntimeConfig[];
  return rows[0];
}

export async function getIndexerRunState(channelSlug: string) {
  const sql = getSql();
  const rows = await sql`
    select
      *,
      coalesce(last_mirror_error, last_observer_error, last_error) as last_error
    from indexer_run_state
    where channel_slug = ${channelSlug}
    limit 1
  ` as IndexerRunState[];
  return rows[0] ?? null;
}

export async function updateIndexerRunState(
  channelSlug: string,
  state: {
    observerRunAt?: Date;
    observerSuccessAt?: Date;
    mirrorRunAt?: Date;
    mirrorSuccessAt?: Date;
    rawHistoryDir?: string | null;
    checkpointBlock?: string | number | bigint | null;
    observerError?: string | null;
    mirrorError?: string | null;
    error?: string | null;
  },
) {
  const sql = getSql();
  const hasObserverError = Object.hasOwn(state, "observerError");
  const hasMirrorError = Object.hasOwn(state, "mirrorError");
  const hasLegacyError = Object.hasOwn(state, "error");
  const legacyError = state.error
    ?? (hasMirrorError && state.mirrorError ? state.mirrorError : null)
    ?? (hasObserverError && state.observerError ? state.observerError : null);
  const rows = await sql`
    insert into indexer_run_state (
      channel_slug,
      last_observer_run_at,
      last_observer_success_at,
      last_observer_error,
      last_mirror_run_at,
      last_mirror_success_at,
      last_mirror_error,
      last_raw_history_dir,
      last_checkpoint_block,
      last_error,
      updated_at
    )
    values (
      ${channelSlug},
      ${state.observerRunAt?.toISOString() ?? null}::timestamptz,
      ${state.observerSuccessAt?.toISOString() ?? null}::timestamptz,
      ${hasObserverError ? state.observerError ?? null : null},
      ${state.mirrorRunAt?.toISOString() ?? null}::timestamptz,
      ${state.mirrorSuccessAt?.toISOString() ?? null}::timestamptz,
      ${hasMirrorError ? state.mirrorError ?? null : null},
      ${state.rawHistoryDir ?? null},
      ${state.checkpointBlock == null ? null : String(state.checkpointBlock)}::bigint,
      ${legacyError},
      now()
    )
    on conflict (channel_slug) do update set
      last_observer_run_at = coalesce(excluded.last_observer_run_at, indexer_run_state.last_observer_run_at),
      last_observer_success_at = coalesce(excluded.last_observer_success_at, indexer_run_state.last_observer_success_at),
      last_observer_error = case
        when ${hasObserverError}::boolean then excluded.last_observer_error
        else indexer_run_state.last_observer_error
      end,
      last_mirror_run_at = coalesce(excluded.last_mirror_run_at, indexer_run_state.last_mirror_run_at),
      last_mirror_success_at = coalesce(excluded.last_mirror_success_at, indexer_run_state.last_mirror_success_at),
      last_mirror_error = case
        when ${hasMirrorError}::boolean then excluded.last_mirror_error
        else indexer_run_state.last_mirror_error
      end,
      last_raw_history_dir = coalesce(excluded.last_raw_history_dir, indexer_run_state.last_raw_history_dir),
      last_checkpoint_block = coalesce(excluded.last_checkpoint_block, indexer_run_state.last_checkpoint_block),
      last_error = case
        when ${hasLegacyError || hasObserverError || hasMirrorError}::boolean then excluded.last_error
        else indexer_run_state.last_error
      end,
      updated_at = now()
    returning *
  ` as IndexerRunState[];
  return rows[0];
}

export function effectiveObserverRpcTimeoutMs(config: Pick<IndexerRuntimeConfig, "observer_rpc_timeout_ms">) {
  return assertPositiveInteger(
    config.observer_rpc_timeout_ms ?? defaultObserverRpcTimeoutMs(),
    "observer_rpc_timeout_ms",
  );
}

export function defaultObserverRpcTimeoutMs() {
  const value = process.env.OBSERVER_RPC_TIMEOUT_MS;
  if (value == null || value.trim() === "") {
    return DEFAULT_OBSERVER_RPC_TIMEOUT_MS;
  }
  return assertPositiveInteger(Number(value), "OBSERVER_RPC_TIMEOUT_MS");
}

function validateConfigInput(input: IndexerRuntimeConfigInput) {
  assertOptionalPositiveInteger(input.mirrorPublishIntervalSeconds, "mirrorPublishIntervalSeconds");
  assertOptionalPositiveInteger(input.blockRangeCap, "blockRangeCap");
  assertOptionalPositiveInteger(input.observerRpcTimeoutMs, "observerRpcTimeoutMs");
  assertOptionalPositiveInteger(input.observerPageCacheTtlSeconds, "observerPageCacheTtlSeconds");
  assertOptionalPositiveInteger(input.observerApiCacheTtlSeconds, "observerApiCacheTtlSeconds");
  assertOptionalPositiveInteger(input.observerSyncMinIntervalSeconds, "observerSyncMinIntervalSeconds");
  assertOptionalPositiveInteger(input.observerEventListLimit, "observerEventListLimit");
  assertOptionalPositiveInteger(input.observerNpmVersionCacheTtlSeconds, "observerNpmVersionCacheTtlSeconds");
  assertOptionalOneOf(input.observerCostProfile, "observerCostProfile", ["cost", "balanced", "performance"]);
  assertOptionalOneOf(input.observerDefaultListMode, "observerDefaultListMode", ["none", "section_only", "all"]);
  assertOptionalOneOf(input.observerIncludeParticipantAccounting, "observerIncludeParticipantAccounting", ["false", "section_only", "always"]);
  assertOptionalOneOf(input.observerIncludeIncidentHistory, "observerIncludeIncidentHistory", ["none", "active_only", "full"]);
  if (input.logRequestsPerSecond != null && (!Number.isFinite(input.logRequestsPerSecond) || input.logRequestsPerSecond <= 0)) {
    throw new Error("logRequestsPerSecond must be a positive number.");
  }
}

function assertOptionalPositiveInteger(value: number | undefined | null, name: string) {
  if (value == null) {
    return;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertOptionalOneOf(value: string | undefined | null, name: string, allowed: readonly string[]) {
  if (value == null) {
    return;
  }
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}.`);
  }
}
