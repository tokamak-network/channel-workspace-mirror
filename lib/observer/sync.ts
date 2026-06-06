import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type AbiEvent,
  type Address,
  type Log,
} from "viem";
import { observerAbi, eventGroupFor } from "./abi";
import { DEFAULT_OBSERVER_CHANNEL, type ObserverChannelConfig } from "./config";
import { effectiveObserverRpcTimeoutMs, requireIndexerRuntimeConfig } from "../indexer/config";
import { updateIndexerPhaseState } from "../indexer/phase-state";
import { getSql } from "../db";

type SyncResult = {
  channel: string;
  rawImported: number;
  targetedInsertedOrUpdated: number;
  latestBlock: string;
};

type ObserverSyncOptions = {
  rpcUrl: string;
  rawHistoryDir?: string | null;
  blockRangeCap: number;
  logRequestsPerSecond: number;
  rpcTimeoutMs: number;
};

type DecodedObserverLog = {
  blockNumber: bigint;
  blockHash: `0x${string}`;
  transactionHash: `0x${string}`;
  transactionIndex: number;
  logIndex: number;
  address: Address;
  eventName: string;
  eventGroup: string;
  args: Record<string, unknown>;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
};

type RawHistoryDocument = {
  method: string;
  event?: string;
  entries?: RawHistoryEntry[];
};

type RawHistoryEntry = {
  response?: unknown[];
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const RAW_RECOVERY_EVENTS = new Set([
  "CurrentRootVectorObserved",
  "StorageKeyObserved",
  "LiquidBalanceStorageWriteObserved",
  "StorageWriteObserved",
]);

const TARGETED_EVENTS = [
  { addressKey: "bridgeCore", eventName: "ChannelCreated" },
  { addressKey: "bridgeCore", eventName: "ChannelWorkspaceMirrorUpdated" },
  { addressKey: "bridgeCore", eventName: "GrothVerifierUpdated" },
  { addressKey: "bridgeCore", eventName: "TokamakVerifierUpdated" },
  { addressKey: "bridgeCore", eventName: "Upgraded" },
  { addressKey: "bridgeCore", eventName: "OwnershipTransferred" },
  { addressKey: "channelManager", eventName: "ChannelTokenVaultIdentityRegistered" },
  { addressKey: "channelManager", eventName: "ChannelTokenVaultIdentityExited" },
  { addressKey: "channelManager", eventName: "JoinTollUpdated" },
  { addressKey: "channelManager", eventName: "JoinTollRefundScheduleUpdated" },
  { addressKey: "channelManager", eventName: "NoteValueEncrypted" },
  { addressKey: "bridgeTokenVault", eventName: "AssetsFunded" },
  { addressKey: "bridgeTokenVault", eventName: "AssetsClaimed" },
  { addressKey: "bridgeTokenVault", eventName: "ChannelJoinTollPaid" },
  { addressKey: "bridgeTokenVault", eventName: "ChannelExitRefunded" },
  { addressKey: "bridgeTokenVault", eventName: "Upgraded" },
  { addressKey: "bridgeTokenVault", eventName: "OwnershipTransferred" },
] as const;

export const TARGETED_EVENT_SYNC_KEY = "targeted-observer-events-v1";

const currentStateAbi = parseAbi([
  "function bridgeTokenVault() view returns (address)",
  "function channelDeployer() view returns (address)",
  "function grothVerifier() view returns (address)",
  "function tokamakVerifier() view returns (address)",
  "function owner() view returns (address)",
  "function getChannel(uint256 channelId) view returns ((bool exists,uint256 dappId,address leader,address asset,address manager,address bridgeTokenVault,bytes32 aPubBlockHash,bytes32 dappMetadataDigestSchema,bytes32 dappMetadataDigest))",
  "function channelId() view returns (uint256)",
  "function dappId() view returns (uint256)",
  "function dappMetadataDigestSchema() view returns (bytes32)",
  "function dappMetadataDigest() view returns (bytes32)",
  "function functionRoot() view returns (bytes32)",
  "function currentRootVectorHash() view returns (bytes32)",
  "function joinToll() view returns (uint256)",
  "function joinTollRefundCutoff1() view returns (uint64)",
  "function joinTollRefundCutoff2() view returns (uint64)",
  "function joinTollRefundCutoff3() view returns (uint64)",
  "function joinTollRefundBps1() view returns (uint16)",
  "function joinTollRefundBps2() view returns (uint16)",
  "function joinTollRefundBps3() view returns (uint16)",
  "function joinTollRefundBps4() view returns (uint16)",
  "function grothVerifierCompatibleBackendVersion() view returns (string)",
  "function tokamakVerifierCompatibleBackendVersion() view returns (string)",
  "function getDAppInfo(uint256 dappId) view returns ((bool exists,bytes32 labelHash,uint256 channelTokenVaultTreeIndex,bytes32 metadataDigestSchema,bytes32 metadataDigest,bytes32 functionRoot))",
  "function getDAppVerifierSnapshot(uint256 dappId) view returns ((address grothVerifier,string grothVerifierCompatibleBackendVersion,address tokamakVerifier,string tokamakVerifierCompatibleBackendVersion))",
]);

export async function syncDefaultObserverChannel(rawHistoryDir?: string | null): Promise<SyncResult> {
  const runtime = await requireIndexerRuntimeConfig(DEFAULT_OBSERVER_CHANNEL.slug);
  const logRequestsPerSecond = requiredPositiveNumber(runtime.log_requests_per_second, "log_requests_per_second");
  const blockRangeCap = requiredPositiveInteger(runtime.block_range_cap, "block_range_cap");
  const rpcTimeoutMs = effectiveObserverRpcTimeoutMs(runtime);
  return syncObserverChannel(DEFAULT_OBSERVER_CHANNEL, {
    rpcUrl: runtime.rpc_url,
    rawHistoryDir,
    blockRangeCap,
    logRequestsPerSecond,
    rpcTimeoutMs,
  });
}

export async function syncObserverChannel(
  channel: ObserverChannelConfig,
  options: ObserverSyncOptions,
): Promise<SyncResult> {
  const sql = getSql();
  await upsertChannel(channel);

  const client = createPublicClient({
    transport: http(options.rpcUrl, { timeout: options.rpcTimeoutMs }),
  });
  const limiter = createRpcRateLimiter(options.logRequestsPerSecond);
  const latestBlock = await limitedRpc(limiter, () => client.getBlockNumber());
  await updateIndexerPhaseState(channel.slug, "current_state_refresh", {
    status: "running",
    startedAt: new Date(),
    latestBlock,
    lastError: null,
  });
  try {
    await refreshChannelCurrentState(channel, client, limiter);
    await updateIndexerPhaseState(channel.slug, "current_state_refresh", {
      status: "succeeded",
      succeededAt: new Date(),
      latestBlock,
      lastError: null,
    });
  } catch (error) {
    await updateIndexerPhaseState(channel.slug, "current_state_refresh", {
      status: "failed",
      failedAt: new Date(),
      latestBlock,
      lastError: errorMessage(error),
    });
    throw error;
  }

  await updateIndexerPhaseState(channel.slug, "raw_history_import", {
    status: options.rawHistoryDir ? "running" : "skipped",
    startedAt: new Date(),
    latestBlock,
    lastError: null,
  });
  let rawImported = 0;
  if (options.rawHistoryDir) {
    try {
      rawImported = await importRawRpcCallHistory({ channel, client, limiter, historyDir: options.rawHistoryDir });
      await updateIndexerPhaseState(channel.slug, "raw_history_import", {
        status: "succeeded",
        succeededAt: new Date(),
        latestBlock,
        lastError: null,
      });
    } catch (error) {
      await updateIndexerPhaseState(channel.slug, "raw_history_import", {
        status: "failed",
        failedAt: new Date(),
        latestBlock,
        lastError: errorMessage(error),
      });
      throw error;
    }
  }

  await updateIndexerPhaseState(channel.slug, "targeted_event_sync", {
    status: "running",
    startedAt: new Date(),
    latestBlock,
    lastError: null,
  });
  let targetedInsertedOrUpdated = 0;
  try {
    targetedInsertedOrUpdated = await syncTargetedEvents({
      channel,
      client,
      limiter,
      latestBlock,
      blockRangeCap: BigInt(options.blockRangeCap),
    });
    await updateIndexerPhaseState(channel.slug, "targeted_event_sync", {
      status: "succeeded",
      succeededAt: new Date(),
      latestBlock,
      lastScannedBlock: latestBlock,
      lastError: null,
    });
  } catch (error) {
    await updateIndexerPhaseState(channel.slug, "targeted_event_sync", {
      status: "failed",
      failedAt: new Date(),
      latestBlock,
      lastError: errorMessage(error),
    });
    throw error;
  }

  await updateSummarySyncState(channel, latestBlock, latestBlock);
  await sql`select 1`;
  return {
    channel: channel.slug,
    rawImported,
    targetedInsertedOrUpdated,
    latestBlock: latestBlock.toString(),
  };
}

async function upsertChannel(channel: ObserverChannelConfig) {
  const sql = getSql();
  await sql`
    insert into observer_channels (
      chain_id,
      channel_id,
      slug,
      name,
      dapp_id,
      genesis_block,
      channel_registration_tx,
      bridge_core,
      channel_manager,
      bridge_token_vault,
      dapp_manager,
      canonical_asset,
      controller,
      l2_accounting_vault,
      dapp_metadata_digest_schema,
      dapp_metadata_digest,
      function_root,
      groth_verifier,
      groth_verifier_version,
      tokamak_verifier,
      tokamak_verifier_version,
      source_code_url,
      abi_url,
      admin_wallet,
      updated_at
    )
    values (
      ${String(channel.chainId)}::bigint,
      ${channel.channelId},
      ${channel.slug},
      ${channel.name},
      ${String(channel.dappId)}::bigint,
      ${channel.genesisBlock.toString()}::bigint,
      ${channel.channelRegistrationTx},
      ${channel.bridgeCore},
      ${channel.channelManager},
      ${channel.bridgeTokenVault},
      ${channel.dAppManager},
      ${channel.canonicalAsset},
      ${channel.controller},
      ${channel.l2AccountingVault},
      ${channel.dappMetadataDigestSchema},
      ${channel.dappMetadataDigest},
      ${channel.functionRoot},
      ${channel.grothVerifier},
      ${channel.grothVerifierVersion},
      ${channel.tokamakVerifier},
      ${channel.tokamakVerifierVersion},
      ${channel.sourceCodeUrl},
      ${channel.abiUrl},
      ${channel.adminWallet},
      now()
    )
    on conflict (chain_id, channel_id) do update set
      slug = excluded.slug,
      name = excluded.name,
      dapp_id = excluded.dapp_id,
      genesis_block = excluded.genesis_block,
      channel_registration_tx = excluded.channel_registration_tx,
      bridge_core = excluded.bridge_core,
      channel_manager = excluded.channel_manager,
      bridge_token_vault = excluded.bridge_token_vault,
      dapp_manager = excluded.dapp_manager,
      canonical_asset = excluded.canonical_asset,
      controller = excluded.controller,
      l2_accounting_vault = excluded.l2_accounting_vault,
      dapp_metadata_digest_schema = excluded.dapp_metadata_digest_schema,
      dapp_metadata_digest = excluded.dapp_metadata_digest,
      function_root = excluded.function_root,
      groth_verifier = excluded.groth_verifier,
      groth_verifier_version = excluded.groth_verifier_version,
      tokamak_verifier = excluded.tokamak_verifier,
      tokamak_verifier_version = excluded.tokamak_verifier_version,
      source_code_url = excluded.source_code_url,
      abi_url = excluded.abi_url,
      admin_wallet = excluded.admin_wallet,
      updated_at = now()
  `;
}

async function refreshChannelCurrentState(
  channel: ObserverChannelConfig,
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
) {
  const bridgeCore = channel.bridgeCore;
  const dappId = BigInt(channel.dappId);

  const [
    bridgeTokenVaultFromCore,
    channelDeployer,
    bridgeOwner,
    bridgeCoreImplementation,
    bridgeTokenVaultImplementation,
    channelDeployment,
  ] = await Promise.all([
    readAddress(client, limiter, bridgeCore, "bridgeTokenVault"),
    readAddress(client, limiter, bridgeCore, "channelDeployer"),
    readAddress(client, limiter, bridgeCore, "owner"),
    readProxySlotAddress(client, limiter, bridgeCore, ERC1967_IMPLEMENTATION_SLOT),
    readProxySlotAddress(client, limiter, channel.bridgeTokenVault, ERC1967_IMPLEMENTATION_SLOT),
    readChannelDeployment(client, limiter, bridgeCore, dappId, BigInt(channel.channelId)),
  ]);

  const [
    channelDAppId,
    channelBridgeTokenVault,
    channelMetadataDigestSchema,
    channelMetadataDigest,
    channelFunctionRoot,
    currentRootVectorHash,
    currentJoinToll,
    tollRefundCutoff1,
    tollRefundCutoff2,
    tollRefundCutoff3,
    tollRefundBps1,
    tollRefundBps2,
    tollRefundBps3,
    tollRefundBps4,
    dAppInfo,
    dAppVerifierSnapshot,
  ] = await Promise.all([
    readUnsignedInteger(client, limiter, channel.channelManager, "dappId"),
    readAddress(client, limiter, channel.channelManager, "bridgeTokenVault"),
    readHexString(client, limiter, channel.channelManager, "dappMetadataDigestSchema"),
    readHexString(client, limiter, channel.channelManager, "dappMetadataDigest"),
    readHexString(client, limiter, channel.channelManager, "functionRoot"),
    readHexString(client, limiter, channel.channelManager, "currentRootVectorHash"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinToll"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundCutoff1"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundCutoff2"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundCutoff3"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundBps1"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundBps2"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundBps3"),
    readUnsignedInteger(client, limiter, channel.channelManager, "joinTollRefundBps4"),
    readDAppInfo(client, limiter, channel.dAppManager, dappId),
    readDAppVerifierSnapshot(client, limiter, channel.dAppManager, dappId),
  ]);

  if (channelDAppId !== dappId) {
    throw new Error(`RPC channel dappId mismatch: expected ${dappId.toString()}, got ${channelDAppId.toString()}.`);
  }
  if (lowerAddress(channelDeployment.manager) !== lowerAddress(channel.channelManager)) {
    throw new Error(`RPC channel manager mismatch between config and BridgeCore.`);
  }
  if (lowerAddress(channelDeployment.asset) !== lowerAddress(channel.canonicalAsset)) {
    throw new Error(`RPC channel canonical asset mismatch between config and BridgeCore.`);
  }
  if (lowerAddress(channelBridgeTokenVault) !== lowerAddress(bridgeTokenVaultFromCore)) {
    throw new Error(`RPC bridgeTokenVault mismatch between BridgeCore and ChannelManager.`);
  }
  if (lowerAddress(channelDeployment.bridgeTokenVault) !== lowerAddress(bridgeTokenVaultFromCore)) {
    throw new Error(`RPC bridgeTokenVault mismatch between BridgeCore channel metadata and BridgeCore state.`);
  }
  if (
    channelMetadataDigestSchema !== dAppInfo.metadataDigestSchema
    || channelMetadataDigest !== dAppInfo.metadataDigest
    || channelFunctionRoot !== dAppInfo.functionRoot
  ) {
    throw new Error("RPC DApp metadata mismatch between DAppManager and ChannelManager.");
  }
  if (
    channelDeployment.dappMetadataDigestSchema !== dAppInfo.metadataDigestSchema
    || channelDeployment.dappMetadataDigest !== dAppInfo.metadataDigest
  ) {
    throw new Error("RPC DApp metadata mismatch between BridgeCore channel metadata and DAppManager.");
  }

  const sql = getSql();
  await sql`
    update observer_channels
    set
      bridge_token_vault = ${bridgeTokenVaultFromCore},
      channel_deployer = ${channelDeployer},
      leader = ${channelDeployment.leader},
      dapp_metadata_digest_schema = ${dAppInfo.metadataDigestSchema},
      dapp_metadata_digest = ${dAppInfo.metadataDigest},
      function_root = ${dAppInfo.functionRoot},
      groth_verifier = ${dAppVerifierSnapshot.grothVerifier},
      groth_verifier_version = ${dAppVerifierSnapshot.grothVerifierCompatibleBackendVersion},
      tokamak_verifier = ${dAppVerifierSnapshot.tokamakVerifier},
      tokamak_verifier_version = ${dAppVerifierSnapshot.tokamakVerifierCompatibleBackendVersion},
      admin_wallet = ${bridgeOwner},
      bridge_core_implementation = ${bridgeCoreImplementation},
      bridge_token_vault_implementation = ${bridgeTokenVaultImplementation},
      current_join_toll = ${currentJoinToll.toString()},
      toll_refund_cutoff1_seconds = ${tollRefundCutoff1.toString()},
      toll_refund_cutoff2_seconds = ${tollRefundCutoff2.toString()},
      toll_refund_cutoff3_seconds = ${tollRefundCutoff3.toString()},
      toll_refund_bps1 = ${tollRefundBps1.toString()},
      toll_refund_bps2 = ${tollRefundBps2.toString()},
      toll_refund_bps3 = ${tollRefundBps3.toString()},
      toll_refund_bps4 = ${tollRefundBps4.toString()},
      current_root_vector_hash = ${currentRootVectorHash},
      current_state_refreshed_at = now(),
      updated_at = now()
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  `;
}

async function readAddress(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address,
    abi: currentStateAbi as any,
    functionName,
    args,
  } as any));
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`RPC ${functionName} did not return an address.`);
  }
  return value as Address;
}

async function readHexString(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address,
    abi: currentStateAbi as any,
    functionName,
    args,
  } as any));
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`RPC ${functionName} did not return a hex string.`);
  }
  return value;
}

async function readUnsignedInteger(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address,
    abi: currentStateAbi as any,
    functionName,
    args,
  } as any));
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new Error(`RPC ${functionName} did not return an unsigned integer.`);
}

async function readDAppInfo(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  dAppManager: Address,
  dappId: bigint,
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address: dAppManager,
    abi: currentStateAbi,
    functionName: "getDAppInfo",
    args: [dappId],
  }));
  const row = value as unknown as Record<string, unknown> & readonly unknown[];
  const exists = row.exists ?? row[0];
  if (exists !== true) {
    throw new Error(`RPC getDAppInfo did not find dappId ${dappId.toString()}.`);
  }
  return {
    metadataDigestSchema: requiredHexField(row, "metadataDigestSchema", 3),
    metadataDigest: requiredHexField(row, "metadataDigest", 4),
    functionRoot: requiredHexField(row, "functionRoot", 5),
  };
}

async function readChannelDeployment(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  bridgeCore: Address,
  expectedDappId: bigint,
  channelId: bigint,
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address: bridgeCore,
    abi: currentStateAbi,
    functionName: "getChannel",
    args: [channelId],
  }));
  const row = value as unknown as Record<string, unknown> & readonly unknown[];
  const exists = row.exists ?? row[0];
  if (exists !== true) {
    throw new Error(`RPC getChannel did not find channelId ${channelId.toString()}.`);
  }
  const dappId = requiredBigIntField(row, "dappId", 1);
  if (dappId !== expectedDappId) {
    throw new Error(`RPC getChannel dappId mismatch: expected ${expectedDappId.toString()}, got ${dappId.toString()}.`);
  }
  return {
    dappId,
    leader: requiredAddressField(row, "leader", 2),
    asset: requiredAddressField(row, "asset", 3),
    manager: requiredAddressField(row, "manager", 4),
    bridgeTokenVault: requiredAddressField(row, "bridgeTokenVault", 5),
    dappMetadataDigestSchema: requiredHexField(row, "dappMetadataDigestSchema", 7),
    dappMetadataDigest: requiredHexField(row, "dappMetadataDigest", 8),
  };
}

async function readDAppVerifierSnapshot(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  dAppManager: Address,
  dappId: bigint,
) {
  const value = await limitedRpc(limiter, () => client.readContract({
    address: dAppManager,
    abi: currentStateAbi,
    functionName: "getDAppVerifierSnapshot",
    args: [dappId],
  }));
  const row = value as unknown as Record<string, unknown> & readonly unknown[];
  return {
    grothVerifier: requiredAddressField(row, "grothVerifier", 0),
    grothVerifierCompatibleBackendVersion: requiredStringField(row, "grothVerifierCompatibleBackendVersion", 1),
    tokamakVerifier: requiredAddressField(row, "tokamakVerifier", 2),
    tokamakVerifierCompatibleBackendVersion: requiredStringField(row, "tokamakVerifierCompatibleBackendVersion", 3),
  };
}

async function readProxySlotAddress(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  address: Address,
  slot: `0x${string}`,
) {
  const value = await limitedRpc(limiter, () => client.getStorageAt({ address, slot }));
  if (!value || value === "0x" || BigInt(value) === 0n) {
    return null;
  }
  return `0x${value.slice(-40)}` as Address;
}

function requiredHexField(row: Record<string, unknown> & readonly unknown[], name: string, index: number) {
  const value = row[name] ?? row[index];
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`RPC result field ${name} is not a hex string.`);
  }
  return value;
}

function requiredAddressField(row: Record<string, unknown> & readonly unknown[], name: string, index: number) {
  return requiredHexField(row, name, index) as Address;
}

function requiredBigIntField(row: Record<string, unknown> & readonly unknown[], name: string, index: number) {
  const value = row[name] ?? row[index];
  if (typeof value !== "bigint") {
    throw new Error(`RPC result field ${name} is not a uint256.`);
  }
  return value;
}

function requiredStringField(row: Record<string, unknown> & readonly unknown[], name: string, index: number) {
  const value = row[name] ?? row[index];
  if (typeof value !== "string") {
    throw new Error(`RPC result field ${name} is not a string.`);
  }
  return value;
}

function lowerAddress(address: string) {
  return address.toLowerCase();
}

async function importRawRpcCallHistory({
  channel,
  client,
  limiter,
  historyDir,
}: {
  channel: ObserverChannelConfig;
  client: ReturnType<typeof createPublicClient>;
  limiter: RpcRateLimiter;
  historyDir: string;
}) {
  if (!fs.existsSync(historyDir)) {
    throw new Error(`RPC call history directory does not exist: ${historyDir}`);
  }

  let imported = 0;
  for (const filePath of rawHistoryFiles(historyDir)) {
    const document = JSON.parse(fs.readFileSync(filePath, "utf8")) as RawHistoryDocument;
    if (document.method !== "eth_getLogs" || !document.event || !RAW_RECOVERY_EVENTS.has(document.event)) {
      continue;
    }

    const entries = Array.isArray(document.entries) ? document.entries : [];
    const fileKey = rawHistoryFileKey(filePath);
    let processed = await getRawHistoryEntriesProcessed(channel, fileKey);
    if (processed > entries.length) {
      processed = 0;
    }

    const decodedLogs: DecodedObserverLog[] = [];
    for (const entry of entries.slice(processed)) {
      for (const rawLog of entry.response ?? []) {
        const normalized = normalizeRawHistoryLog(rawLog);
        if (!normalized) {
          continue;
        }
        const decoded = decodeRelevantLogs(channel, [normalized]);
        decodedLogs.push(...decoded);
      }
    }

    const timestamps = await blockTimestamps(client, limiter, decodedLogs);
    for (const decoded of decodedLogs) {
      await insertObserverEvent(channel, decoded, timestamps.get(decoded.blockNumber.toString()) ?? null);
      imported += 1;
    }
    await updateRawHistoryEntriesProcessed(channel, fileKey, entries.length);
  }
  return imported;
}

async function syncTargetedEvents({
  channel,
  client,
  limiter,
  latestBlock,
  blockRangeCap,
}: {
  channel: ObserverChannelConfig;
  client: ReturnType<typeof createPublicClient>;
  limiter: RpcRateLimiter;
  latestBlock: bigint;
  blockRangeCap: bigint;
}) {
  let insertedOrUpdated = 0;
  const state = await getEventSyncState(channel, TARGETED_EVENT_SYNC_KEY);
  const fromBlock = state?.last_scanned_block ? BigInt(state.last_scanned_block) + 1n : channel.genesisBlock;
  if (fromBlock > latestBlock) {
    await updateEventSyncState(channel, TARGETED_EVENT_SYNC_KEY, state?.last_scanned_block ? BigInt(state.last_scanned_block) : channel.genesisBlock - 1n, latestBlock);
    return insertedOrUpdated;
  }

  const filter = targetedLogFilter(channel);
  for (const { fromBlock: chunkFromBlock, toBlock } of targetedScanRanges(fromBlock, latestBlock, blockRangeCap)) {
    const logs = await limitedRpc(limiter, () => client.getLogs({
      address: filter.addresses,
      events: filter.events,
      fromBlock: chunkFromBlock,
      toBlock,
    }));
    const relevantLogs = decodeRelevantLogs(channel, logs);
    const timestamps = await blockTimestamps(client, limiter, relevantLogs);

    for (const decoded of relevantLogs) {
      await insertObserverEvent(channel, decoded, timestamps.get(decoded.blockNumber.toString()) ?? null);
      insertedOrUpdated += 1;
    }

    await updateEventSyncState(channel, TARGETED_EVENT_SYNC_KEY, toBlock, latestBlock);
  }
  return insertedOrUpdated;
}

export function targetedLogFilter(channel: ObserverChannelConfig) {
  return {
    addresses: targetedAddresses(channel),
    events: targetedAbiEvents(),
  };
}

export function targetedScanRanges(fromBlock: bigint, latestBlock: bigint, blockRangeCap: bigint) {
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let cursor = fromBlock;
  while (cursor <= latestBlock) {
    const toBlock = minBigInt(cursor + blockRangeCap - 1n, latestBlock);
    ranges.push({ fromBlock: cursor, toBlock });
    cursor = toBlock + 1n;
  }
  return ranges;
}

export function targetedEventNames() {
  return [...new Set(TARGETED_EVENTS.map((target) => target.eventName))];
}

function targetedAddresses(channel: ObserverChannelConfig) {
  return [...new Set(TARGETED_EVENTS.map((target) => channel[target.addressKey] as Address))];
}

function targetedAbiEvents() {
  return targetedEventNames().map((eventName) => requiredAbiEvent(eventName));
}

function rawHistoryFiles(historyDir: string) {
  return fs.readdirSync(historyDir)
    .filter((file) => file.startsWith("eth_getLogs.") && file.endsWith(".json"))
    .map((file) => path.join(historyDir, file))
    .sort();
}

function rawHistoryFileKey(filePath: string) {
  return path.basename(filePath);
}

async function getRawHistoryEntriesProcessed(channel: ObserverChannelConfig, fileKey: string) {
  const sql = getSql();
  const rows = await sql`
    select entries_processed
    from observer_raw_history_import_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
      and file_key = ${fileKey}
    limit 1
  ` as { entries_processed: number }[];
  return rows[0]?.entries_processed ?? 0;
}

async function updateRawHistoryEntriesProcessed(channel: ObserverChannelConfig, fileKey: string, entriesProcessed: number) {
  const sql = getSql();
  await sql`
    insert into observer_raw_history_import_state (chain_id, channel_id, file_key, entries_processed, updated_at)
    values (${String(channel.chainId)}::bigint, ${channel.channelId}, ${fileKey}, ${String(entriesProcessed)}::integer, now())
    on conflict (chain_id, channel_id, file_key) do update set
      entries_processed = excluded.entries_processed,
      updated_at = now()
  `;
}

async function getEventSyncState(channel: ObserverChannelConfig, syncKey: string) {
  const sql = getSql();
  const rows = await sql`
    select last_scanned_block
    from observer_event_sync_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
      and sync_key = ${syncKey}
    limit 1
  ` as { last_scanned_block: string }[];
  return rows[0] ?? null;
}

async function updateEventSyncState(
  channel: ObserverChannelConfig,
  syncKey: string,
  lastScannedBlock: bigint,
  latestBlock: bigint,
) {
  const sql = getSql();
  await sql`
    insert into observer_event_sync_state (chain_id, channel_id, sync_key, last_scanned_block, latest_block, updated_at)
    values (
      ${String(channel.chainId)}::bigint,
      ${channel.channelId},
      ${syncKey},
      ${lastScannedBlock.toString()}::bigint,
      ${latestBlock.toString()}::bigint,
      now()
    )
    on conflict (chain_id, channel_id, sync_key) do update set
      last_scanned_block = excluded.last_scanned_block,
      latest_block = excluded.latest_block,
      updated_at = now()
  `;
}

async function updateSummarySyncState(channel: ObserverChannelConfig, lastScannedBlock: bigint, latestBlock: bigint) {
  const sql = getSql();
  await sql`
    insert into observer_sync_state (chain_id, channel_id, last_scanned_block, latest_block, updated_at)
    values (
      ${String(channel.chainId)}::bigint,
      ${channel.channelId},
      ${lastScannedBlock.toString()}::bigint,
      ${latestBlock.toString()}::bigint,
      now()
    )
    on conflict (chain_id, channel_id) do update set
      last_scanned_block = excluded.last_scanned_block,
      latest_block = excluded.latest_block,
      updated_at = now()
  `;
}

export async function resetObserverAccumulatedScan(channel: ObserverChannelConfig) {
  const sql = getSql();
  await sql`
    delete from observer_raw_history_import_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  `;
  await sql`
    delete from observer_event_sync_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  `;
  await sql`
    delete from observer_sync_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  `;
  await sql`
    delete from observer_events
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  `;
}

function decodeRelevantLogs(channel: ObserverChannelConfig, logs: Log[]): DecodedObserverLog[] {
  const decoded: DecodedObserverLog[] = [];
  for (const log of logs) {
    if (log.removed || !log.blockNumber || !log.blockHash || !log.transactionHash) {
      continue;
    }
    try {
      const event = decodeEventLog({
        abi: observerAbi,
        data: log.data,
        topics: log.topics,
      });
      if (!isRelevantDecodedEvent(channel, log.address, event.eventName, event.args)) {
        continue;
      }
      decoded.push({
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex ?? 0,
        logIndex: log.logIndex ?? 0,
        address: log.address,
        eventName: event.eventName,
        eventGroup: eventGroupFor(event.eventName),
        args: normalizeDecodedArgs(event.args),
        topics: log.topics,
        data: log.data,
      });
    } catch {
      continue;
    }
  }
  return decoded;
}

function isRelevantDecodedEvent(
  channel: ObserverChannelConfig,
  address: Address,
  eventName: string,
  args: unknown,
) {
  const lowerAddress = address.toLowerCase();
  const decoded = args as Record<string, unknown>;
  const channelId = decoded.channelId == null ? null : String(decoded.channelId);

  if (eventName === "AssetsFunded" || eventName === "AssetsClaimed") {
    return lowerAddress === channel.bridgeTokenVault.toLowerCase();
  }
  if (eventName === "GrothVerifierUpdated" || eventName === "TokamakVerifierUpdated") {
    return lowerAddress === channel.bridgeCore.toLowerCase();
  }
  if (eventName === "Upgraded" || eventName === "OwnershipTransferred") {
    return lowerAddress === channel.bridgeCore.toLowerCase() || lowerAddress === channel.bridgeTokenVault.toLowerCase();
  }
  if (channelId !== null && channelId !== channel.channelId) {
    return false;
  }
  if (eventName === "ChannelCreated" || eventName === "ChannelWorkspaceMirrorUpdated") {
    return lowerAddress === channel.bridgeCore.toLowerCase();
  }
  if (eventName === "ChannelJoinTollPaid" || eventName === "ChannelExitRefunded" || eventName === "StorageWriteObserved") {
    return lowerAddress === channel.bridgeTokenVault.toLowerCase();
  }
  return lowerAddress === channel.channelManager.toLowerCase();
}

function normalizeRawHistoryLog(rawLog: unknown): Log | null {
  if (!rawLog || typeof rawLog !== "object") {
    return null;
  }
  const log = rawLog as Record<string, unknown>;
  const blockNumber = toBigIntOrNull(log.blockNumber);
  const transactionHash = normalizeHexString(log.transactionHash);
  const blockHash = normalizeHexString(log.blockHash);
  const address = normalizeHexString(log.address);
  const data = normalizeHexString(log.data) ?? "0x";
  const topics = Array.isArray(log.topics)
    ? log.topics.map((topic) => normalizeHexString(topic)).filter((topic): topic is `0x${string}` => Boolean(topic))
    : [];
  if (blockNumber === null || !transactionHash || !blockHash || !address || topics.length === 0) {
    return null;
  }
  return {
    address: address as Address,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    data,
    blockNumber,
    blockHash,
    transactionHash,
    transactionIndex: toNumberOrZero(log.transactionIndex),
    logIndex: toNumberOrZero(log.logIndex ?? log.index),
    removed: Boolean(log.removed),
  };
}

function normalizeDecodedArgs(args: unknown) {
  if (!args || typeof args !== "object") {
    return {};
  }
  return JSON.parse(JSON.stringify(args, jsonReplacer)) as Record<string, unknown>;
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

async function blockTimestamps(
  client: ReturnType<typeof createPublicClient>,
  limiter: RpcRateLimiter,
  logs: DecodedObserverLog[],
) {
  const timestamps = new Map<string, string>();
  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber.toString()))];
  for (const blockNumberText of blockNumbers) {
    const blockNumber = BigInt(blockNumberText);
    const block = await limitedRpc(limiter, () => client.getBlock({ blockNumber }));
    const timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
    timestamps.set(blockNumber.toString(), timestamp);
  }

  return timestamps;
}

type RpcRateLimiter = {
  wait: () => Promise<void>;
};

function createRpcRateLimiter(requestsPerSecond: number): RpcRateLimiter {
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    throw new Error("logRequestsPerSecond must be a positive number.");
  }
  const intervalMs = 1000 / requestsPerSecond;
  let nextAvailableAt = 0;
  let queue = Promise.resolve();

  return {
    wait() {
      const scheduled = queue.then(async () => {
        const now = Date.now();
        const scheduledAt = Math.max(now, nextAvailableAt);
        const delayMs = scheduledAt - now;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        nextAvailableAt = scheduledAt + intervalMs;
      });
      queue = scheduled.catch(() => undefined);
      return scheduled;
    },
  };
}

async function limitedRpc<T>(limiter: RpcRateLimiter, call: () => Promise<T>) {
  await limiter.wait();
  return call();
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

async function insertObserverEvent(
  channel: ObserverChannelConfig,
  log: DecodedObserverLog,
  blockTimestamp: string | null,
) {
  const sql = getSql();
  await sql`
    insert into observer_events (
      chain_id,
      channel_id,
      block_number,
      block_hash,
      block_timestamp,
      transaction_hash,
      transaction_index,
      log_index,
      contract_address,
      event_name,
      event_group,
      decoded,
      raw_topics,
      raw_data
    )
    values (
      ${String(channel.chainId)}::bigint,
      ${channel.channelId},
      ${log.blockNumber.toString()}::bigint,
      ${log.blockHash},
      ${blockTimestamp}::timestamptz,
      ${log.transactionHash},
      ${String(log.transactionIndex)}::integer,
      ${String(log.logIndex)}::integer,
      ${log.address},
      ${log.eventName},
      ${log.eventGroup},
      ${JSON.stringify(log.args)}::jsonb,
      ${JSON.stringify(log.topics)}::jsonb,
      ${log.data}
    )
    on conflict (chain_id, channel_id, transaction_hash, log_index) do update set
      block_number = excluded.block_number,
      block_hash = excluded.block_hash,
      block_timestamp = excluded.block_timestamp,
      transaction_index = excluded.transaction_index,
      contract_address = excluded.contract_address,
      event_name = excluded.event_name,
      event_group = excluded.event_group,
      decoded = excluded.decoded,
      raw_topics = excluded.raw_topics,
      raw_data = excluded.raw_data
  `;
}

function requiredAbiEvent(eventName: string) {
  const event = observerAbi.find((item) => item.type === "event" && item.name === eventName) as AbiEvent | undefined;
  if (!event) {
    throw new Error(`Observer ABI does not contain event ${eventName}.`);
  }
  return event;
}

function toBigIntOrNull(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && value.length > 0) {
    return BigInt(value);
  }
  return null;
}

function toNumberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.length > 0) {
    return Number(BigInt(value));
  }
  return 0;
}

function normalizeHexString(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    return null;
  }
  return value as `0x${string}`;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function zeroAddress() {
  return ZERO_ADDRESS;
}
