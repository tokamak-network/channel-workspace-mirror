import { getSql } from "../db";

export type IndexerRuntimeConfig = {
  channel_slug: string;
  rpc_url: string | null;
  log_requests_per_second: string | null;
  block_range_cap: number | null;
  mirror_publish_interval_seconds: number;
  observer_sync_interval_seconds: number;
  mirror_publish_account: string | null;
  updated_at: string;
  created_at: string;
};

export type IndexerRunState = {
  channel_slug: string;
  last_observer_run_at: string | null;
  last_observer_success_at: string | null;
  last_mirror_run_at: string | null;
  last_mirror_success_at: string | null;
  last_raw_history_dir: string | null;
  last_checkpoint_block: string | null;
  last_error: string | null;
  updated_at: string;
};

export type IndexerRuntimeConfigInput = {
  rpcUrl?: string | null;
  logRequestsPerSecond?: number | null;
  blockRangeCap?: number | null;
  mirrorPublishIntervalSeconds?: number;
  observerSyncIntervalSeconds?: number;
  mirrorPublishAccount?: string | null;
};

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
      mirror_publish_interval_seconds,
      observer_sync_interval_seconds,
      mirror_publish_account,
      updated_at
    )
    values (
      ${channelSlug},
      ${input.rpcUrl ?? null},
      ${input.logRequestsPerSecond == null ? null : String(input.logRequestsPerSecond)}::numeric,
      ${input.blockRangeCap == null ? null : String(input.blockRangeCap)}::integer,
      ${String(input.mirrorPublishIntervalSeconds ?? 86400)}::integer,
      ${String(input.observerSyncIntervalSeconds ?? 3600)}::integer,
      ${input.mirrorPublishAccount ?? null},
      now()
    )
    on conflict (channel_slug) do update set
      rpc_url = excluded.rpc_url,
      log_requests_per_second = excluded.log_requests_per_second,
      block_range_cap = excluded.block_range_cap,
      mirror_publish_interval_seconds = excluded.mirror_publish_interval_seconds,
      observer_sync_interval_seconds = excluded.observer_sync_interval_seconds,
      mirror_publish_account = excluded.mirror_publish_account,
      updated_at = now()
    returning *
  ` as IndexerRuntimeConfig[];
  return rows[0];
}

export async function getIndexerRunState(channelSlug: string) {
  const sql = getSql();
  const rows = await sql`
    select *
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
    error?: string | null;
  },
) {
  const sql = getSql();
  const rows = await sql`
    insert into indexer_run_state (
      channel_slug,
      last_observer_run_at,
      last_observer_success_at,
      last_mirror_run_at,
      last_mirror_success_at,
      last_raw_history_dir,
      last_checkpoint_block,
      last_error,
      updated_at
    )
    values (
      ${channelSlug},
      ${state.observerRunAt?.toISOString() ?? null}::timestamptz,
      ${state.observerSuccessAt?.toISOString() ?? null}::timestamptz,
      ${state.mirrorRunAt?.toISOString() ?? null}::timestamptz,
      ${state.mirrorSuccessAt?.toISOString() ?? null}::timestamptz,
      ${state.rawHistoryDir ?? null},
      ${state.checkpointBlock == null ? null : String(state.checkpointBlock)}::bigint,
      ${state.error ?? null},
      now()
    )
    on conflict (channel_slug) do update set
      last_observer_run_at = coalesce(excluded.last_observer_run_at, indexer_run_state.last_observer_run_at),
      last_observer_success_at = coalesce(excluded.last_observer_success_at, indexer_run_state.last_observer_success_at),
      last_mirror_run_at = coalesce(excluded.last_mirror_run_at, indexer_run_state.last_mirror_run_at),
      last_mirror_success_at = coalesce(excluded.last_mirror_success_at, indexer_run_state.last_mirror_success_at),
      last_raw_history_dir = coalesce(excluded.last_raw_history_dir, indexer_run_state.last_raw_history_dir),
      last_checkpoint_block = coalesce(excluded.last_checkpoint_block, indexer_run_state.last_checkpoint_block),
      last_error = excluded.last_error,
      updated_at = now()
    returning *
  ` as IndexerRunState[];
  return rows[0];
}

export function isDue(lastRunAt: string | null, intervalSeconds: number, now = new Date()) {
  if (!lastRunAt) {
    return true;
  }
  const lastRunMs = Date.parse(lastRunAt);
  if (!Number.isFinite(lastRunMs)) {
    return true;
  }
  return now.getTime() - lastRunMs >= intervalSeconds * 1000;
}

function validateConfigInput(input: IndexerRuntimeConfigInput) {
  assertOptionalPositiveInteger(input.mirrorPublishIntervalSeconds, "mirrorPublishIntervalSeconds");
  assertOptionalPositiveInteger(input.observerSyncIntervalSeconds, "observerSyncIntervalSeconds");
  assertOptionalPositiveInteger(input.blockRangeCap, "blockRangeCap");
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
