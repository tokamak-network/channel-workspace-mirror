import { getSql } from "../db";

export type IndexerPhaseName =
  | "current_state_refresh"
  | "raw_history_import"
  | "targeted_event_sync"
  | "mirror_publish";

export type IndexerPhaseStatus = "running" | "succeeded" | "failed" | "skipped";

export type IndexerPhaseStateUpdate = {
  status: IndexerPhaseStatus;
  startedAt?: Date | null;
  succeededAt?: Date | null;
  failedAt?: Date | null;
  latestBlock?: string | number | bigint | null;
  lastScannedBlock?: string | number | bigint | null;
  checkpointBlock?: string | number | bigint | null;
  lastError?: string | null;
};

export async function updateIndexerPhaseState(
  channelSlug: string,
  phase: IndexerPhaseName,
  update: IndexerPhaseStateUpdate,
) {
  const sql = getSql();
  const hasStartedAt = Object.hasOwn(update, "startedAt");
  const hasSucceededAt = Object.hasOwn(update, "succeededAt");
  const hasFailedAt = Object.hasOwn(update, "failedAt");
  const hasLatestBlock = Object.hasOwn(update, "latestBlock");
  const hasLastScannedBlock = Object.hasOwn(update, "lastScannedBlock");
  const hasCheckpointBlock = Object.hasOwn(update, "checkpointBlock");
  const hasLastError = Object.hasOwn(update, "lastError");
  await sql`
    insert into indexer_phase_state (
      channel_slug,
      phase,
      status,
      started_at,
      succeeded_at,
      failed_at,
      latest_block,
      last_scanned_block,
      checkpoint_block,
      last_error,
      updated_at
    )
    values (
      ${channelSlug},
      ${phase},
      ${update.status},
      ${serializeDate(update.startedAt)}::timestamptz,
      ${serializeDate(update.succeededAt)}::timestamptz,
      ${serializeDate(update.failedAt)}::timestamptz,
      ${serializeBigInt(update.latestBlock)}::bigint,
      ${serializeBigInt(update.lastScannedBlock)}::bigint,
      ${serializeBigInt(update.checkpointBlock)}::bigint,
      ${hasLastError ? update.lastError ?? null : null},
      now()
    )
    on conflict (channel_slug, phase) do update set
      status = excluded.status,
      started_at = case
        when ${hasStartedAt}::boolean then excluded.started_at
        else indexer_phase_state.started_at
      end,
      succeeded_at = case
        when excluded.status in ('running', 'failed') then null
        when ${hasSucceededAt}::boolean then excluded.succeeded_at
        else indexer_phase_state.succeeded_at
      end,
      failed_at = case
        when excluded.status in ('running', 'succeeded', 'skipped') then null
        when ${hasFailedAt}::boolean then excluded.failed_at
        else indexer_phase_state.failed_at
      end,
      latest_block = case
        when ${hasLatestBlock}::boolean then excluded.latest_block
        else indexer_phase_state.latest_block
      end,
      last_scanned_block = case
        when ${hasLastScannedBlock}::boolean then excluded.last_scanned_block
        else indexer_phase_state.last_scanned_block
      end,
      checkpoint_block = case
        when ${hasCheckpointBlock}::boolean then excluded.checkpoint_block
        else indexer_phase_state.checkpoint_block
      end,
      last_error = case
        when excluded.status in ('running', 'succeeded', 'skipped') then null
        when ${hasLastError}::boolean then excluded.last_error
        else indexer_phase_state.last_error
      end,
      updated_at = now()
  `;
}

function serializeDate(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

function serializeBigInt(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}
