import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

let sqlClient: SqlClient | null = null;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

export async function getDatabaseHealth() {
  try {
    const sql = getSql();
    await sql`select 1 as ok`;
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type PublishRow = {
  id: number;
  chain_id: string;
  channel_id: string;
  channel_name: string | null;
  checkpoint_block: string;
  recovery_root_vector_hash: string;
  manifest_path: string;
  public_manifest_path: string;
  manifest_blob_url: string;
  checkpoint_path: string;
  public_checkpoint_path: string;
  checkpoint_blob_url: string;
  checkpoint_sha256: string;
  checkpoint_size_bytes: string;
  delta_bundles: unknown;
  leader: string;
  published_at: string;
};

export async function getLatestPublish(chainId: number | string, channelId: string) {
  const sql = getSql();
  const rows = await sql`
    select *
    from mirror_publish_history
    where chain_id = ${String(chainId)}::bigint
      and channel_id = ${channelId}
    order by checkpoint_block desc, id desc
    limit 1
  ` as PublishRow[];
  return rows[0] ?? null;
}
