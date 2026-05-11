import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { sha256Hex } from "../lib/crypto";
import { validateMirrorUploadDirectory } from "../lib/manifest";
import { blobUrlFromPublishRowsForPublicPath, deltaBlobUrlFromLatestRow } from "../lib/route-lookup";

test("validates a CLI-compatible mirror output directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-upload-"));
  const mirrorDir = path.join(root, ".well-known", "tokamak-private-state", "channel-workspace", "1", "123");
  fs.mkdirSync(path.join(mirrorDir, "deltas"), { recursive: true });

  const checkpoint = checkpointZip();
  const delta = deltaBytes();
  fs.writeFileSync(path.join(mirrorDir, "checkpoint.zip"), checkpoint);
  fs.writeFileSync(path.join(mirrorDir, "deltas", "10-19.json"), delta);
  fs.writeFileSync(path.join(mirrorDir, "manifest.json"), JSON.stringify(manifest({
    checkpointSha256: sha256Hex(checkpoint),
    checkpointSizeBytes: checkpoint.length,
    deltaSha256: sha256Hex(delta),
    deltaSizeBytes: delta.length,
  })));

  const result = await validateMirrorUploadDirectory(root);

  assert.equal(result.manifest.channelId, "123");
  assert.equal(result.artifacts.length, 3);
  assert.equal(result.artifacts[0]?.publicPath, ".well-known/tokamak-private-state/channel-workspace/1/123/manifest.json");
  assert.equal(result.artifacts[1]?.publicPath, ".well-known/tokamak-private-state/channel-workspace/1/123/checkpoint.zip");
});

test("rejects missing checkpoint and delta sizeBytes", async () => {
  await assert.rejects(
    () => validateMirrorUploadDirectory(writeUploadFixture({ checkpointSizeBytes: undefined })),
    /checkpoint\.bundle\.sizeBytes must be an integer/u,
  );
  await assert.rejects(
    () => validateMirrorUploadDirectory(writeUploadFixture({ deltaSizeBytes: undefined })),
    /deltaBundles\[0\]\.sizeBytes must be an integer/u,
  );
});

test("rejects malformed checkpoint ZIP structure", async () => {
  const zip = new AdmZip();
  zip.addFile("workspace.json", jsonBytes({ ok: true }));
  zip.addFile("state_snapshot.json", jsonBytes({ ok: true }));
  zip.addFile("block_info.json", jsonBytes({ ok: true }));
  zip.addFile("nested/contract_codes.json", jsonBytes({ ok: true }));

  await assert.rejects(
    () => validateMirrorUploadDirectory(writeUploadFixture({ checkpoint: zip.toBuffer() })),
    /checkpoint\.zip contains unsupported directory|checkpoint\.zip contains nested path/u,
  );
});

test("rejects delta JSON that does not match the manifest descriptor", async () => {
  await assert.rejects(
    () => validateMirrorUploadDirectory(writeUploadFixture({
      delta: deltaBytes({ fromBlock: 11 }),
    })),
    /deltaBundles\[0\]\.fromBlock mismatch/u,
  );
});

test("rejects unsafe bundle URLs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-upload-"));
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest({
    checkpointUrl: "../checkpoint.zip",
    checkpointSha256: "0".repeat(64),
    checkpointSizeBytes: 1,
    deltaSha256: "1".repeat(64),
    deltaSizeBytes: 1,
  })));

  await assert.rejects(() => validateMirrorUploadDirectory(root), /unsafe path segment/u);
});

test("resolves seeded publish rows for well-known, base-path, and direct manifest paths", () => {
  const rows = [
    publishRow({
      checkpointBlock: 20,
      manifestPath: ".well-known/tokamak-private-state/channel-workspace/1/123/manifest.json",
      checkpointPath: ".well-known/tokamak-private-state/channel-workspace/1/123/checkpoint.zip",
      deltaPath: ".well-known/tokamak-private-state/channel-workspace/1/123/deltas/10-19.json",
    }),
    publishRow({
      checkpointBlock: 30,
      manifestPath: "operator-a/.well-known/tokamak-private-state/channel-workspace/1/123/manifest.json",
      checkpointPath: "operator-a/.well-known/tokamak-private-state/channel-workspace/1/123/checkpoint.zip",
      deltaPath: "operator-a/.well-known/tokamak-private-state/channel-workspace/1/123/deltas/20-29.json",
    }),
    publishRow({
      checkpointBlock: 40,
      manifestPath: "custom/channel-123.json",
      checkpointPath: "custom/checkpoint.zip",
      deltaPath: "custom/deltas/30-39.json",
    }),
  ];

  assert.equal(
    blobUrlFromPublishRowsForPublicPath(rows, ".well-known/tokamak-private-state/channel-workspace/1/123/manifest.json"),
    "https://blob.example/20/manifest",
  );
  assert.equal(
    blobUrlFromPublishRowsForPublicPath(rows, "operator-a/.well-known/tokamak-private-state/channel-workspace/1/123/checkpoint.zip"),
    "https://blob.example/30/checkpoint",
  );
  assert.equal(
    blobUrlFromPublishRowsForPublicPath(rows, "custom/deltas/30-39.json"),
    "https://blob.example/40/delta",
  );
  assert.equal(deltaBlobUrlFromLatestRow(rows[1]?.delta_bundles, "20-29.json"), "https://blob.example/30/delta");
});

function manifest({
  checkpointUrl = "checkpoint.zip",
  checkpointSha256,
  checkpointSizeBytes,
  deltaSha256,
  deltaSizeBytes,
}: {
  checkpointUrl?: string;
  checkpointSha256: string;
  checkpointSizeBytes?: number;
  deltaSha256: string;
  deltaSizeBytes?: number;
}) {
  return {
    protocolVersion: 2,
    chainId: 1,
    channelId: "123",
    channelName: "example",
    bridgeCore: "0x0000000000000000000000000000000000000001",
    channelManager: "0x0000000000000000000000000000000000000002",
    bridgeTokenVault: "0x0000000000000000000000000000000000000003",
    leader: "0x0000000000000000000000000000000000000004",
    checkpoint: {
      recoveryLastScannedBlock: 20,
      recoveryRootVectorHash: `0x${"a".repeat(64)}`,
      workspaceHash: `0x${"b".repeat(64)}`,
      stateSnapshotHash: `0x${"c".repeat(64)}`,
      blockInfoHash: `0x${"d".repeat(64)}`,
      contractCodesHash: `0x${"e".repeat(64)}`,
      bundle: {
        url: checkpointUrl,
        sha256: checkpointSha256,
        sizeBytes: checkpointSizeBytes,
      },
    },
    deltaBundles: [
      {
        fromBlock: 10,
        toBlock: 19,
        url: "deltas/10-19.json",
        sha256: deltaSha256,
        sizeBytes: deltaSizeBytes,
      },
    ],
    validationCertificate: {
      schema: "tokamak-private-state-workspace-mirror",
      signer: "0x0000000000000000000000000000000000000004",
      canary: {
        proofVerified: true,
      },
      signature: "0x1234",
    },
  };
}

function writeUploadFixture(options: {
  checkpoint?: Buffer;
  delta?: Buffer;
  checkpointSizeBytes?: number;
  deltaSizeBytes?: number;
} = {}) {
  const checkpoint = options.checkpoint ?? checkpointZip();
  const delta = options.delta ?? deltaBytes();
  const checkpointSizeBytes = Object.hasOwn(options, "checkpointSizeBytes")
    ? options.checkpointSizeBytes
    : checkpoint.length;
  const deltaSizeBytes = Object.hasOwn(options, "deltaSizeBytes")
    ? options.deltaSizeBytes
    : delta.length;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-upload-"));
  const mirrorDir = path.join(root, ".well-known", "tokamak-private-state", "channel-workspace", "1", "123");
  fs.mkdirSync(path.join(mirrorDir, "deltas"), { recursive: true });
  fs.writeFileSync(path.join(mirrorDir, "checkpoint.zip"), checkpoint);
  fs.writeFileSync(path.join(mirrorDir, "deltas", "10-19.json"), delta);
  fs.writeFileSync(path.join(mirrorDir, "manifest.json"), JSON.stringify(manifest({
    checkpointSha256: sha256Hex(checkpoint),
    checkpointSizeBytes,
    deltaSha256: sha256Hex(delta),
    deltaSizeBytes,
  })));
  return root;
}

function checkpointZip() {
  const zip = new AdmZip();
  zip.addFile("workspace.json", jsonBytes({ ok: "workspace" }));
  zip.addFile("state_snapshot.json", jsonBytes({ ok: "state_snapshot" }));
  zip.addFile("block_info.json", jsonBytes({ ok: "block_info" }));
  zip.addFile("contract_codes.json", jsonBytes({ ok: "contract_codes" }));
  return zip.toBuffer();
}

function deltaBytes(overrides: Record<string, unknown> = {}) {
  return jsonBytes({
    protocolVersion: 2,
    chainId: 1,
    channelId: "123",
    fromBlock: 10,
    toBlock: 19,
    baseRecoveryRootVectorHash: `0x${"9".repeat(64)}`,
    recoveryRootVectorHash: `0x${"a".repeat(64)}`,
    logs: [],
    ...overrides,
  });
}

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function publishRow({
  checkpointBlock,
  manifestPath,
  checkpointPath,
  deltaPath,
}: {
  checkpointBlock: number;
  manifestPath: string;
  checkpointPath: string;
  deltaPath: string;
}) {
  return {
    id: checkpointBlock,
    checkpoint_block: checkpointBlock,
    public_manifest_path: manifestPath,
    manifest_blob_url: `https://blob.example/${checkpointBlock}/manifest`,
    public_checkpoint_path: checkpointPath,
    checkpoint_blob_url: `https://blob.example/${checkpointBlock}/checkpoint`,
    delta_bundles: [
      {
        url: `deltas/${checkpointBlock - 10}-${checkpointBlock - 1}.json`,
        publicPath: deltaPath,
        blobUrl: `https://blob.example/${checkpointBlock}/delta`,
      },
    ],
  };
}
