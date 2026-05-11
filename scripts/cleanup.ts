import { loadLocalEnv } from "../lib/env";
import { getSql } from "../lib/db";

loadLocalEnv();

type CandidateRow = {
  id: number;
  chain_id: string;
  channel_id: string;
  checkpoint_block: string;
  manifest_path: string;
  checkpoint_path: string;
  delta_bundles: unknown;
  published_at: string;
};

async function main() {
  const retainCheckpoints = numberOption("--retain-checkpoints", 2);
  const minHistoryDays = numberOption("--min-history-days", 30);
  const sql = getSql();
  const rows = await sql`
    with ranked as (
      select
        *,
        row_number() over (
          partition by chain_id, channel_id
          order by checkpoint_block desc, id desc
        ) as checkpoint_rank
      from mirror_publish_history
    )
    select
      id,
      chain_id,
      channel_id,
      checkpoint_block,
      manifest_path,
      checkpoint_path,
      delta_bundles,
      published_at
    from ranked
    where checkpoint_rank > ${retainCheckpoints}
      and published_at < now() - (${String(minHistoryDays)} || ' days')::interval
    order by chain_id, channel_id, checkpoint_block desc
  ` as CandidateRow[];

  const candidates = rows.map((row) => ({
    publishId: row.id,
    chainId: row.chain_id,
    channelId: row.channel_id,
    checkpointBlock: row.checkpoint_block,
    publishedAt: row.published_at,
    blobPaths: [
      row.manifest_path,
      row.checkpoint_path,
      ...deltaBlobPaths(row.delta_bundles),
    ],
  }));

  console.log(JSON.stringify({
    dryRun: true,
    retainCheckpoints,
    minHistoryDays,
    candidatePublishes: candidates.length,
    candidates,
  }, null, 2));
}

function numberOption(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function deltaBlobPaths(value: unknown) {
  const bundles = parseJsonArray(value);
  return bundles
    .map((bundle) => typeof bundle?.blobPath === "string" ? bundle.blobPath : null)
    .filter((value): value is string => Boolean(value));
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
