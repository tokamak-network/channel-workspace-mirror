import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import AdmZip from "adm-zip";
import { MIRROR_PROTOCOL_VERSION } from "./constants";
import { CHECKPOINT_FILES } from "./constants";
import { sha256File } from "./crypto";
import { assertSafeRelativeUrl, joinPublicPath, resolveArtifactPath, toPublicPath } from "./paths";

export type MirrorBundleDescriptor = {
  url: string;
  sha256: string;
  sizeBytes: number;
};

export type MirrorDeltaBundle = MirrorBundleDescriptor & {
  fromBlock: number;
  toBlock: number;
};

export type MirrorManifest = {
  protocolVersion: number;
  chainId: number;
  channelId: string;
  channelName?: string;
  bridgeCore: string;
  channelManager: string;
  bridgeTokenVault: string;
  leader: string;
  checkpoint: {
    recoveryLastScannedBlock: number;
    recoveryRootVectorHash: string;
    workspaceHash: string;
    stateSnapshotHash: string;
    blockInfoHash: string;
    contractCodesHash: string;
    bundle: MirrorBundleDescriptor;
  };
  deltaBundles?: MirrorDeltaBundle[];
  validationCertificate: {
    schema: string;
    signer?: string;
    signedAt?: string;
    canary?: {
      proofVerified?: boolean;
      description?: string;
    };
    signature: string;
  };
  createdAt?: string;
  minCliVersion?: string;
};

export type ValidatedArtifact = {
  kind: "manifest" | "checkpoint" | "delta";
  relativeUrl: string;
  publicPath: string;
  filePath: string;
  sha256: string;
  sizeBytes: number;
  fromBlock?: number;
  toBlock?: number;
};

export type ValidatedMirrorUpload = {
  rootDir: string;
  manifestPath: string;
  manifestDir: string;
  manifest: MirrorManifest;
  manifestSha256: string;
  manifestSizeBytes: number;
  artifacts: ValidatedArtifact[];
};

export function findSingleManifest(rootDir: string) {
  const matches: string[] = [];
  walk(rootDir, (filePath) => {
    if (path.basename(filePath) === "manifest.json") {
      matches.push(filePath);
    }
  });
  if (matches.length === 0) {
    throw new Error(`No manifest.json found under ${rootDir}.`);
  }
  if (matches.length > 1) {
    throw new Error(`Expected exactly one manifest.json, found ${matches.length}.`);
  }
  return matches[0];
}

export async function validateMirrorUploadDirectory(rootDir: string): Promise<ValidatedMirrorUpload> {
  const resolvedRoot = path.resolve(rootDir);
  const manifestPath = findSingleManifest(resolvedRoot);
  const manifestDir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MirrorManifest;
  validateManifestShape(manifest);

  const manifestStat = fs.statSync(manifestPath);
  const manifestPublicPath = toPublicPath(manifestPath, resolvedRoot);
  const manifestSha256 = await sha256File(manifestPath);
  const checkpoint = await validateBundle({
    manifest,
    manifestDir,
    manifestPublicPath,
    descriptor: manifest.checkpoint.bundle,
    kind: "checkpoint",
    label: "checkpoint.bundle",
  });

  const deltaBundles = Array.isArray(manifest.deltaBundles) ? manifest.deltaBundles : [];
  const deltas = await Promise.all(deltaBundles.map((bundle, index) => validateBundle({
    manifest,
    manifestDir,
    manifestPublicPath,
    descriptor: bundle,
    kind: "delta",
    label: `deltaBundles[${index}]`,
    fromBlock: Number(bundle.fromBlock),
    toBlock: Number(bundle.toBlock),
  })));

  return {
    rootDir: resolvedRoot,
    manifestPath,
    manifestDir,
    manifest,
    manifestSha256,
    manifestSizeBytes: manifestStat.size,
    artifacts: [
      {
        kind: "manifest",
        relativeUrl: "manifest.json",
        publicPath: manifestPublicPath,
        filePath: manifestPath,
        sha256: manifestSha256,
        sizeBytes: manifestStat.size,
      },
      checkpoint,
      ...deltas,
    ],
  };
}

function validateManifestShape(manifest: MirrorManifest) {
  if (Number(manifest.protocolVersion) !== MIRROR_PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocolVersion ${String(manifest.protocolVersion)}.`);
  }
  if (!Number.isInteger(Number(manifest.chainId))) {
    throw new Error("manifest.chainId must be an integer.");
  }
  if (typeof manifest.channelId !== "string" || manifest.channelId.trim() === "") {
    throw new Error("manifest.channelId must be a non-empty string.");
  }
  for (const field of ["bridgeCore", "channelManager", "bridgeTokenVault", "leader"] as const) {
    if (typeof manifest[field] !== "string" || !/^0x[0-9a-f]{40}$/iu.test(manifest[field])) {
      throw new Error(`manifest.${field} must be an EVM address.`);
    }
  }
  const checkpoint = manifest.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") {
    throw new Error("manifest.checkpoint is required.");
  }
  if (!Number.isInteger(Number(checkpoint.recoveryLastScannedBlock))) {
    throw new Error("manifest.checkpoint.recoveryLastScannedBlock must be an integer.");
  }
  for (const field of ["recoveryRootVectorHash", "workspaceHash", "stateSnapshotHash", "blockInfoHash", "contractCodesHash"] as const) {
    if (typeof checkpoint[field] !== "string" || !/^0x[0-9a-f]{64}$/iu.test(checkpoint[field])) {
      throw new Error(`manifest.checkpoint.${field} must be a bytes32 hex string.`);
    }
  }
  if (!checkpoint.bundle || typeof checkpoint.bundle !== "object") {
    throw new Error("manifest.checkpoint.bundle is required.");
  }
  validateBundleDescriptor(checkpoint.bundle, "checkpoint.bundle");
  if (manifest.validationCertificate?.schema !== "tokamak-private-state-workspace-mirror") {
    throw new Error("manifest.validationCertificate.schema mismatch.");
  }
  if (manifest.validationCertificate?.canary?.proofVerified !== true) {
    throw new Error("manifest.validationCertificate.canary.proofVerified must be true.");
  }
  if (typeof manifest.validationCertificate.signature !== "string" || !/^0x[0-9a-f]+$/iu.test(manifest.validationCertificate.signature)) {
    throw new Error("manifest.validationCertificate.signature must be a hex string.");
  }
  for (const [index, bundle] of (manifest.deltaBundles ?? []).entries()) {
    if (!Number.isInteger(Number(bundle.fromBlock)) || !Number.isInteger(Number(bundle.toBlock))) {
      throw new Error(`manifest.deltaBundles[${index}] block range must be integers.`);
    }
    validateBundleDescriptor(bundle, `deltaBundles[${index}]`);
  }
}

function validateBundleDescriptor(descriptor: MirrorBundleDescriptor, label: string) {
  assertSafeRelativeUrl(descriptor.url, `${label}.url`);
  if (typeof descriptor.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(descriptor.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 digest.`);
  }
  if (!Number.isInteger(Number(descriptor.sizeBytes))) {
    throw new Error(`${label}.sizeBytes must be an integer.`);
  }
}

async function validateBundle({
  manifest,
  manifestDir,
  manifestPublicPath,
  descriptor,
  kind,
  label,
  fromBlock,
  toBlock,
}: {
  manifest: MirrorManifest;
  manifestDir: string;
  manifestPublicPath: string;
  descriptor: MirrorBundleDescriptor;
  kind: "checkpoint" | "delta";
  label: string;
  fromBlock?: number;
  toBlock?: number;
}): Promise<ValidatedArtifact> {
  const relativeUrl = assertSafeRelativeUrl(descriptor.url, `${label}.url`);
  const filePath = resolveArtifactPath(manifestDir, relativeUrl);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label}.url references a missing file: ${relativeUrl}`);
  }
  const stat = fs.statSync(filePath);
  if (Number(descriptor.sizeBytes) !== stat.size) {
    throw new Error(`${label}.sizeBytes mismatch. Expected ${descriptor.sizeBytes}, got ${stat.size}.`);
  }
  const digest = await sha256File(filePath);
  if (digest !== descriptor.sha256) {
    throw new Error(`${label}.sha256 mismatch. Expected ${descriptor.sha256}, got ${digest}.`);
  }
  if (kind === "checkpoint") {
    validateCheckpointZip(filePath);
  } else {
    validateDeltaJson({ filePath, manifest, fromBlock, toBlock, label });
  }
  return {
    kind,
    relativeUrl,
    publicPath: joinPublicPath(manifestPublicPath, relativeUrl),
    filePath,
    sha256: digest,
    sizeBytes: stat.size,
    fromBlock,
    toBlock,
  };
}

function validateCheckpointZip(filePath: string) {
  const zip = new AdmZip(filePath);
  const seen = new Set<string>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      throw new Error(`checkpoint.zip contains unsupported directory: ${entry.entryName}`);
    }
    const entryName = entry.entryName;
    if (
      path.posix.isAbsolute(entryName)
      || entryName.includes("\\")
      || entryName.split("/").some((segment) => segment === ".." || segment === "")
    ) {
      throw new Error(`checkpoint.zip contains unsupported path: ${entryName}`);
    }
    if (entryName.includes("/")) {
      throw new Error(`checkpoint.zip contains nested path: ${entryName}`);
    }
    if (!CHECKPOINT_FILES.has(entryName)) {
      throw new Error(`checkpoint.zip contains unsupported file: ${entryName}`);
    }
    if (seen.has(entryName)) {
      throw new Error(`checkpoint.zip contains duplicate file: ${entryName}`);
    }
    seen.add(entryName);
    parseJsonBytes(entry.getData(), `checkpoint.zip ${entryName}`);
  }
  for (const fileName of CHECKPOINT_FILES) {
    if (!seen.has(fileName)) {
      throw new Error(`checkpoint.zip is missing ${fileName}.`);
    }
  }
}

function validateDeltaJson({
  filePath,
  manifest,
  fromBlock,
  toBlock,
  label,
}: {
  filePath: string;
  manifest: MirrorManifest;
  fromBlock?: number;
  toBlock?: number;
  label: string;
}) {
  const delta = parseJsonBytes(fs.readFileSync(filePath), label) as Record<string, unknown>;
  if (Number(delta.protocolVersion) !== MIRROR_PROTOCOL_VERSION) {
    throw new Error(`${label}.protocolVersion mismatch.`);
  }
  if (Number(delta.chainId) !== Number(manifest.chainId)) {
    throw new Error(`${label}.chainId mismatch.`);
  }
  if (String(delta.channelId) !== String(manifest.channelId)) {
    throw new Error(`${label}.channelId mismatch.`);
  }
  if (Number(delta.fromBlock) !== fromBlock) {
    throw new Error(`${label}.fromBlock mismatch.`);
  }
  if (Number(delta.toBlock) !== toBlock) {
    throw new Error(`${label}.toBlock mismatch.`);
  }
  for (const field of ["baseRecoveryRootVectorHash", "recoveryRootVectorHash"] as const) {
    if (typeof delta[field] !== "string" || !/^0x[0-9a-f]{64}$/iu.test(delta[field])) {
      throw new Error(`${label}.${field} must be a bytes32 hex string.`);
    }
  }
  if (String(delta.recoveryRootVectorHash).toLowerCase() !== manifest.checkpoint.recoveryRootVectorHash.toLowerCase()) {
    throw new Error(`${label}.recoveryRootVectorHash must match the manifest checkpoint root.`);
  }
  if (!Array.isArray(delta.logs)) {
    throw new Error(`${label}.logs must be an array.`);
  }
}

function parseJsonBytes(bytes: Buffer, label: string) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function walk(rootDir: string, onFile: (filePath: string) => void) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath, onFile);
    } else if (entry.isFile()) {
      onFile(filePath);
    }
  }
}
