import { put } from "@vercel/blob";
import fs from "node:fs";
import { Readable } from "node:stream";
import { getLatestPublish, getSql } from "./db";
import type { ValidatedArtifact, ValidatedMirrorUpload } from "./manifest";
import { blobPrefix } from "./paths";

type UploadedArtifact = ValidatedArtifact & {
  blobPath: string;
  blobUrl: string;
};

export async function publishMirrorUpload(upload: ValidatedMirrorUpload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required.");
  }
  const checkpointBlock = Number(upload.manifest.checkpoint.recoveryLastScannedBlock);
  const latest = await getLatestPublish(upload.manifest.chainId, upload.manifest.channelId);
  if (latest && checkpointBlock <= Number(latest.checkpoint_block)) {
    throw new Error(
      `Refusing stale checkpoint ${checkpointBlock}; latest published checkpoint is ${latest.checkpoint_block}.`,
    );
  }

  const uploaded: UploadedArtifact[] = [];
  for (const artifact of upload.artifacts) {
    uploaded.push(await uploadArtifact(upload, artifact));
  }

  const manifestArtifact = mustFind(uploaded, "manifest");
  const checkpointArtifact = mustFind(uploaded, "checkpoint");
  const deltaBundles = uploaded
    .filter((artifact) => artifact.kind === "delta")
    .map((artifact) => ({
      fromBlock: artifact.fromBlock,
      toBlock: artifact.toBlock,
      url: artifact.relativeUrl,
      publicPath: artifact.publicPath,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      blobPath: artifact.blobPath,
      blobUrl: artifact.blobUrl,
    }));

  const sql = getSql();
  const rows = await sql`
    insert into mirror_publish_history (
      chain_id,
      channel_id,
      channel_name,
      checkpoint_block,
      recovery_root_vector_hash,
      manifest_path,
      public_manifest_path,
      manifest_blob_url,
      checkpoint_path,
      public_checkpoint_path,
      checkpoint_blob_url,
      checkpoint_sha256,
      checkpoint_size_bytes,
      delta_bundles,
      leader
    )
    values (
      ${String(upload.manifest.chainId)}::bigint,
      ${upload.manifest.channelId},
      ${upload.manifest.channelName ?? null},
      ${String(checkpointBlock)}::bigint,
      ${upload.manifest.checkpoint.recoveryRootVectorHash},
      ${manifestArtifact.blobPath},
      ${manifestArtifact.publicPath},
      ${manifestArtifact.blobUrl},
      ${checkpointArtifact.blobPath},
      ${checkpointArtifact.publicPath},
      ${checkpointArtifact.blobUrl},
      ${checkpointArtifact.sha256},
      ${String(checkpointArtifact.sizeBytes)}::bigint,
      ${JSON.stringify(deltaBundles)}::jsonb,
      ${upload.manifest.leader}
    )
    returning id, published_at
  ` as { id: number; published_at: string }[];

  return {
    id: rows[0]?.id,
    publishedAt: rows[0]?.published_at,
    chainId: upload.manifest.chainId,
    channelId: upload.manifest.channelId,
    checkpointBlock,
    manifestUrl: `/${manifestArtifact.publicPath}`,
    checkpointUrl: `/${checkpointArtifact.publicPath}`,
    deltas: deltaBundles.map((bundle) => ({
      fromBlock: bundle.fromBlock,
      toBlock: bundle.toBlock,
      url: `/${bundle.publicPath}`,
    })),
  };
}

function mustFind(uploaded: UploadedArtifact[], kind: UploadedArtifact["kind"]) {
  const artifact = uploaded.find((candidate) => candidate.kind === kind);
  if (!artifact) {
    throw new Error(`Missing uploaded ${kind} artifact.`);
  }
  return artifact;
}

async function uploadArtifact(upload: ValidatedMirrorUpload, artifact: ValidatedArtifact): Promise<UploadedArtifact> {
  const key = blobKey(upload, artifact);
  const stream = Readable.toWeb(fs.createReadStream(artifact.filePath)) as ReadableStream;
  const blob = await put(key, stream, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: contentTypeFor(artifact),
  });
  return {
    ...artifact,
    blobPath: key,
    blobUrl: blob.url,
  };
}

function blobKey(upload: ValidatedMirrorUpload, artifact: ValidatedArtifact) {
  const prefix = blobPrefix(upload.manifest.chainId, upload.manifest.channelId);
  const checkpointBlock = Number(upload.manifest.checkpoint.recoveryLastScannedBlock);
  if (artifact.kind === "manifest") {
    return `${prefix}/manifests/${checkpointBlock}-${artifact.sha256}.json`;
  }
  if (artifact.kind === "checkpoint") {
    return `${prefix}/checkpoints/${checkpointBlock}-${artifact.sha256}.zip`;
  }
  return `${prefix}/deltas/${artifact.fromBlock}-${artifact.toBlock}-${artifact.sha256}.json`;
}

function contentTypeFor(artifact: ValidatedArtifact) {
  if (artifact.kind === "checkpoint") {
    return "application/zip";
  }
  return "application/json; charset=utf-8";
}
