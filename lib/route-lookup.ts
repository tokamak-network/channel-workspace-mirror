import { getLatestPublish, getSql } from "./db";

type StoredDelta = {
  fromBlock?: number;
  toBlock?: number;
  url?: string;
  publicPath?: string;
  blobUrl?: string;
};

type PublicPathRow = {
  checkpoint_block?: string | number;
  id?: string | number;
  public_manifest_path?: string | null;
  manifest_blob_url?: string | null;
  public_checkpoint_path?: string | null;
  checkpoint_blob_url?: string | null;
  delta_bundles?: unknown;
};

export async function latestManifestBlobUrl(chainId: string, channelId: string) {
  const row = await getLatestPublish(chainId, channelId);
  return row?.manifest_blob_url ?? null;
}

export async function latestCheckpointBlobUrl(chainId: string, channelId: string) {
  const row = await getLatestPublish(chainId, channelId);
  return row?.checkpoint_blob_url ?? null;
}

export async function latestDeltaBlobUrl(chainId: string, channelId: string, range: string) {
  const row = await getLatestPublish(chainId, channelId);
  if (!row) {
    return null;
  }
  return deltaBlobUrlFromLatestRow(row.delta_bundles, range);
}

export async function blobUrlForPublicPath(publicPath: string) {
  const sql = getSql();
  const manifestRows = await sql`
    select manifest_blob_url
    from mirror_publish_history
    where public_manifest_path = ${publicPath}
    order by checkpoint_block desc, id desc
    limit 1
  ` as { manifest_blob_url: string }[];
  if (manifestRows[0]) {
    return manifestRows[0].manifest_blob_url;
  }

  const checkpointRows = await sql`
    select checkpoint_blob_url
    from mirror_publish_history
    where public_checkpoint_path = ${publicPath}
    order by checkpoint_block desc, id desc
    limit 1
  ` as { checkpoint_blob_url: string }[];
  if (checkpointRows[0]) {
    return checkpointRows[0].checkpoint_blob_url;
  }

  const deltaRows = await sql`
    select delta_bundles
    from mirror_publish_history
    where delta_bundles @> ${JSON.stringify([{ publicPath }])}::jsonb
    order by checkpoint_block desc, id desc
    limit 10
  ` as { delta_bundles: unknown }[];
  return blobUrlFromPublishRowsForPublicPath(deltaRows, publicPath);
}

export function deltaBlobUrlFromLatestRow(deltaBundles: unknown, range: string) {
  const bundles = parseDeltaBundles(deltaBundles);
  const expectedUrl = `deltas/${range}`;
  return bundles.find((bundle) => bundle.url === expectedUrl)?.blobUrl ?? null;
}

export function blobUrlFromPublishRowsForPublicPath(rows: PublicPathRow[], publicPath: string) {
  const sortedRows = [...rows].sort((left, right) => compareRowsDesc(left, right));
  for (const row of sortedRows) {
    if (row.public_manifest_path === publicPath && row.manifest_blob_url) {
      return row.manifest_blob_url;
    }
    if (row.public_checkpoint_path === publicPath && row.checkpoint_blob_url) {
      return row.checkpoint_blob_url;
    }
    const match = parseDeltaBundles(row.delta_bundles).find((bundle) => bundle.publicPath === publicPath);
    if (match?.blobUrl) {
      return match.blobUrl;
    }
  }
  return null;
}

function parseDeltaBundles(value: unknown): StoredDelta[] {
  if (Array.isArray(value)) {
    return value as StoredDelta[];
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

function compareRowsDesc(left: PublicPathRow, right: PublicPathRow) {
  const leftBlock = Number(left.checkpoint_block ?? 0);
  const rightBlock = Number(right.checkpoint_block ?? 0);
  if (leftBlock !== rightBlock) {
    return rightBlock - leftBlock;
  }
  return Number(right.id ?? 0) - Number(left.id ?? 0);
}
