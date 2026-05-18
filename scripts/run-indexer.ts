import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "../lib/env";
import {
  getIndexerRunState,
  isDue,
  requireIndexerRuntimeConfig,
  updateIndexerRunState,
} from "../lib/indexer/config";
import { validateMirrorUploadDirectory } from "../lib/manifest";
import { publishMirrorUpload } from "../lib/publish";
import { DEFAULT_OBSERVER_CHANNEL } from "../lib/observer/config";
import { resetObserverAccumulatedScan, syncObserverChannel } from "../lib/observer/sync";

loadLocalEnv();

type RecoverResult = {
  recoveryLastScannedBlock?: string | number;
  rpcCallHistory?: {
    historyDir?: string;
  } | null;
};

type WorkspaceRecovery = {
  result: RecoverResult;
  fromGenesis: boolean;
};

async function main() {
  const channel = DEFAULT_OBSERVER_CHANNEL;
  const config = await requireIndexerRuntimeConfig(channel.slug);
  const state = await getIndexerRunState(channel.slug);
  const now = new Date();
  const observerDue = config.observer_enabled
    && isDue(state?.last_observer_run_at ?? null, config.observer_sync_interval_seconds, now);
  const mirrorDue = config.mirror_enabled
    && isDue(state?.last_mirror_run_at ?? null, config.mirror_publish_interval_seconds, now);

  if (!observerDue && !mirrorDue) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "not_due" }, null, 2));
    return;
  }

  try {
    await configurePrivateStateCli(config);
    const localWorkspaceRecovered = hasLocalRecoveredWorkspace(channel.name);
    const recovery = observerDue || mirrorDue ? recoverWorkspace(channel.name, !localWorkspaceRecovered) : null;
    const rawHistoryDir = recovery?.result.rpcCallHistory?.historyDir ?? null;

    let observer = null;
    if (observerDue) {
      if (recovery?.fromGenesis) {
        await resetObserverAccumulatedScan(channel);
      }
      const logRequestsPerSecond = requiredPositiveNumber(config.log_requests_per_second, "log_requests_per_second");
      const blockRangeCap = requiredPositiveInteger(config.block_range_cap, "block_range_cap");
      await updateIndexerRunState(channel.slug, { observerRunAt: now, rawHistoryDir });
      observer = await syncObserverChannel(channel, {
        rpcUrl: config.rpc_url,
        rawHistoryDir,
        blockRangeCap,
        logRequestsPerSecond,
      });
      await updateIndexerRunState(channel.slug, {
        observerSuccessAt: new Date(),
        rawHistoryDir,
        error: null,
      });
    }

    let mirror = null;
    if (mirrorDue) {
      if (!config.mirror_publish_account) {
        throw new Error("mirrorPublishAccount is required when mirror publishing is enabled.");
      }
      await updateIndexerRunState(channel.slug, { mirrorRunAt: now, rawHistoryDir });
      mirror = await publishMirror({ channelName: channel.name, account: config.mirror_publish_account, outputDir: config.mirror_output_dir });
      await updateIndexerRunState(channel.slug, {
        mirrorSuccessAt: new Date(),
        rawHistoryDir,
        checkpointBlock: mirror.checkpointBlock,
        error: null,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      recoveryLastScannedBlock: recovery?.result.recoveryLastScannedBlock ?? null,
      recoveryFromGenesis: recovery?.fromGenesis ?? null,
      rawHistoryDir,
      observer,
      mirror,
    }, null, 2));
  } catch (error) {
    await updateIndexerRunState(channel.slug, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function configurePrivateStateCli(config: Awaited<ReturnType<typeof requireIndexerRuntimeConfig>>) {
  ensureReadOnlyInstall();
  const logRequestsPerSecond = requiredPositiveNumber(config.log_requests_per_second, "log_requests_per_second");
  const blockRangeCap = requiredPositiveInteger(config.block_range_cap, "block_range_cap");
  const rpcArgs = ["set", "rpc", "--network", "mainnet", "--rpc-url", config.rpc_url];
  rpcArgs.push("--log-requests-per-second", String(logRequestsPerSecond));
  rpcArgs.push("--block-range-cap", String(blockRangeCap));
  run("private-state-cli", rpcArgs);
}

function ensureReadOnlyInstall() {
  if (hasReadOnlyInstall()) {
    return;
  }
  run("private-state-cli", ["install", "--read-only"]);
}

function hasReadOnlyInstall() {
  const root = path.join(os.homedir(), "tokamak-private-channels", "dapps", "private-state");
  const manifestPath = path.join(root, "install-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      install?: {
        mode?: string;
        installedDeploymentArtifacts?: { chainId?: number }[];
      };
    };
    const hasMainnetArtifacts = manifest.install?.installedDeploymentArtifacts
      ?.some((artifact) => Number(artifact.chainId) === 1) === true;
    const requiredFiles = [
      "bridge.1.json",
      "bridge-abi-manifest.1.json",
      "deployment.1.latest.json",
      "storage-layout.1.latest.json",
    ];
    return manifest.install?.mode === "read-only"
      && hasMainnetArtifacts
      && requiredFiles.every((file) => fs.existsSync(path.join(root, "chain-id-1", file)));
  } catch {
    return false;
  }
}

function runRecoverWorkspace(channelName: string, fromGenesis: boolean) {
  const result = run("private-state-cli", [
    "channel",
    "recover-workspace",
    "--channel-name",
    channelName,
    "--network",
    "mainnet",
    "--source",
    "rpc",
    ...(fromGenesis ? ["--from-genesis"] : []),
    "--output-raw",
    "--json",
  ], { capture: true });
  return parseLastJsonObject(result.stdout) as RecoverResult;
}

function recoverWorkspace(channelName: string, fromGenesis: boolean): WorkspaceRecovery {
  if (fromGenesis) {
    return {
      result: runRecoverWorkspace(channelName, true),
      fromGenesis: true,
    };
  }
  try {
    return {
      result: runRecoverWorkspace(channelName, false),
      fromGenesis: false,
    };
  } catch (error) {
    console.warn(`Incremental workspace recovery failed; retrying from genesis: ${error instanceof Error ? error.message : String(error)}`);
    return {
      result: runRecoverWorkspace(channelName, true),
      fromGenesis: true,
    };
  }
}

function hasLocalRecoveredWorkspace(channelName: string) {
  const channelDir = path.join(os.homedir(), "tokamak-private-channels", "workspace", "mainnet", channelName, "channel");
  const workspacePath = path.join(channelDir, "workspace.json");
  const requiredFiles = [
    workspacePath,
    path.join(channelDir, "current", "state_snapshot.json"),
    path.join(channelDir, "current", "block_info.json"),
  ];
  if (!requiredFiles.every((file) => fs.existsSync(file))) {
    return false;
  }
  try {
    const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8")) as {
      recoverySource?: string;
      recoveryLastScannedBlock?: unknown;
      recoveryRootVectorHash?: unknown;
    };
    return workspace.recoverySource === "rpc"
      && isPositiveBlockNumber(workspace.recoveryLastScannedBlock)
      && typeof workspace.recoveryRootVectorHash === "string"
      && workspace.recoveryRootVectorHash.startsWith("0x");
  } catch {
    return false;
  }
}

function isPositiveBlockNumber(value: unknown) {
  const parsed = typeof value === "bigint" ? value : BigInt(String(value));
  return parsed > 0n;
}

async function publishMirror({
  channelName,
  account,
  outputDir,
}: {
  channelName: string;
  account: string;
  outputDir: string | null;
}) {
  const targetDir = outputDir ?? path.join(os.tmpdir(), `${channelName}-mirror-public`);
  fs.rmSync(targetDir, { recursive: true, force: true });
  run("private-state-cli", [
    "channel",
    "publish-workspace-mirror",
    "--channel-name",
    channelName,
    "--network",
    "mainnet",
    "--account",
    account,
    "--output",
    targetDir,
  ]);
  const upload = await validateMirrorUploadDirectory(targetDir);
  const result = await publishMirrorUpload(upload);
  return {
    outputDir: targetDir,
    checkpointBlock: upload.manifest.checkpoint.recoveryLastScannedBlock,
    publish: result,
  };
}

function run(command: string, args: string[], options: { capture?: boolean } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`${command} ${formatArgs(args)} failed with exit code ${result.status ?? "unknown"}${stderr ? `: ${stderr}` : ""}`);
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function formatArgs(args: string[]) {
  const masked = [...args];
  const rpcUrlIndex = masked.indexOf("--rpc-url");
  if (rpcUrlIndex !== -1 && masked[rpcUrlIndex + 1]) {
    masked[rpcUrlIndex + 1] = "<redacted>";
  }
  return masked.join(" ");
}

function parseLastJsonObject(stdout: string) {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf("\n{");
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Unable to parse private-state-cli JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredPositiveInteger(value: number | null, name: string) {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be configured as a positive integer.`);
  }
  return value;
}

function requiredPositiveNumber(value: string | number | null, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be configured as a positive number.`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
