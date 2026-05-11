import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256Hex } from "../lib/crypto";
import { validateMirrorUploadDirectory } from "../lib/manifest";

test("validates a CLI-compatible mirror output directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-upload-"));
  const mirrorDir = path.join(root, ".well-known", "tokamak-private-state", "channel-workspace", "1", "123");
  fs.mkdirSync(path.join(mirrorDir, "deltas"), { recursive: true });

  const checkpoint = Buffer.from("checkpoint");
  const delta = Buffer.from(JSON.stringify({ protocolVersion: 2 }));
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

function manifest({
  checkpointUrl = "checkpoint.zip",
  checkpointSha256,
  checkpointSizeBytes,
  deltaSha256,
  deltaSizeBytes,
}: {
  checkpointUrl?: string;
  checkpointSha256: string;
  checkpointSizeBytes: number;
  deltaSha256: string;
  deltaSizeBytes: number;
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
