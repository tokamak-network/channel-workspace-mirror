import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  http,
  type AbiEvent,
  type Address,
  type Log,
} from "viem";
import { observerAbi, eventGroupFor } from "./abi";
import { DEFAULT_OBSERVER_CHANNEL, type ObserverChannelConfig } from "./config";
import { requireIndexerRuntimeConfig } from "../indexer/config";
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
  batchSize: number;
  confirmations: bigint;
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

const CLI_RAW_RECOVERY_SOURCE = "cli_raw_recovery";
const TARGETED_RPC_SOURCE = "observer_targeted_rpc";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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
  { addressKey: "channelManager", eventName: "NoteValueEncrypted" },
  { addressKey: "bridgeTokenVault", eventName: "AssetsFunded" },
  { addressKey: "bridgeTokenVault", eventName: "AssetsClaimed" },
  { addressKey: "bridgeTokenVault", eventName: "ChannelJoinTollPaid" },
  { addressKey: "bridgeTokenVault", eventName: "ChannelExitRefunded" },
  { addressKey: "bridgeTokenVault", eventName: "Upgraded" },
  { addressKey: "bridgeTokenVault", eventName: "OwnershipTransferred" },
] as const;

export async function syncDefaultObserverChannel(rawHistoryDir?: string | null): Promise<SyncResult> {
  const runtime = await requireIndexerRuntimeConfig(DEFAULT_OBSERVER_CHANNEL.slug);
  return syncObserverChannel(DEFAULT_OBSERVER_CHANNEL, {
    rpcUrl: runtime.rpc_url,
    rawHistoryDir,
    batchSize: runtime.observer_batch_size,
    confirmations: BigInt(runtime.observer_confirmations),
  });
}

export async function syncObserverChannel(
  channel: ObserverChannelConfig,
  options: ObserverSyncOptions,
): Promise<SyncResult> {
  const sql = getSql();
  await upsertChannel(channel);

  const client = createPublicClient({
    transport: http(options.rpcUrl),
  });
  const latestBlock = await client.getBlockNumber();
  const safeLatestBlock = latestBlock > options.confirmations ? latestBlock - options.confirmations : 0n;

  const rawImported = options.rawHistoryDir
    ? await importRawRpcCallHistory({ channel, client, historyDir: options.rawHistoryDir })
    : 0;
  const targetedInsertedOrUpdated = await syncTargetedEvents({
    channel,
    client,
    safeLatestBlock,
    latestBlock,
    batchSize: BigInt(options.batchSize),
  });

  await updateSummarySyncState(channel, safeLatestBlock, latestBlock);
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
      bridge_core,
      channel_manager,
      bridge_token_vault,
      canonical_asset,
      controller,
      l2_accounting_vault,
      leader,
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
      ${channel.bridgeCore},
      ${channel.channelManager},
      ${channel.bridgeTokenVault},
      ${channel.canonicalAsset},
      ${channel.controller},
      ${channel.l2AccountingVault},
      ${channel.leader},
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
      bridge_core = excluded.bridge_core,
      channel_manager = excluded.channel_manager,
      bridge_token_vault = excluded.bridge_token_vault,
      canonical_asset = excluded.canonical_asset,
      controller = excluded.controller,
      l2_accounting_vault = excluded.l2_accounting_vault,
      leader = excluded.leader,
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

async function importRawRpcCallHistory({
  channel,
  client,
  historyDir,
}: {
  channel: ObserverChannelConfig;
  client: ReturnType<typeof createPublicClient>;
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
    let processed = await getRawHistoryEntriesProcessed(channel, filePath);
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

    const timestamps = await blockTimestamps(client, channel.chainId, decodedLogs);
    for (const decoded of decodedLogs) {
      await insertObserverEvent(channel, decoded, timestamps.get(decoded.blockNumber.toString()) ?? null, CLI_RAW_RECOVERY_SOURCE);
      imported += 1;
    }
    await updateRawHistoryEntriesProcessed(channel, filePath, entries.length);
  }
  return imported;
}

async function syncTargetedEvents({
  channel,
  client,
  safeLatestBlock,
  latestBlock,
  batchSize,
}: {
  channel: ObserverChannelConfig;
  client: ReturnType<typeof createPublicClient>;
  safeLatestBlock: bigint;
  latestBlock: bigint;
  batchSize: bigint;
}) {
  let insertedOrUpdated = 0;
  for (const target of TARGETED_EVENTS) {
    const syncKey = `targeted:${target.addressKey}:${target.eventName}`;
    const state = await getEventSyncState(channel, syncKey);
    const fromBlock = state?.last_scanned_block ? BigInt(state.last_scanned_block) + 1n : channel.genesisBlock;
    if (fromBlock > safeLatestBlock) {
      await updateEventSyncState(channel, syncKey, state?.last_scanned_block ? BigInt(state.last_scanned_block) : channel.genesisBlock - 1n, latestBlock);
      continue;
    }

    let cursor = fromBlock;
    while (cursor <= safeLatestBlock) {
      const toBlock = minBigInt(cursor + batchSize - 1n, safeLatestBlock);
      const logs = await client.getLogs({
        address: addressForTarget(channel, target.addressKey),
        event: abiEvent(target.eventName),
        fromBlock: cursor,
        toBlock,
      });
      const relevantLogs = decodeRelevantLogs(channel, logs);
      const timestamps = await blockTimestamps(client, channel.chainId, relevantLogs);

      for (const decoded of relevantLogs) {
        await insertObserverEvent(channel, decoded, timestamps.get(decoded.blockNumber.toString()) ?? null, TARGETED_RPC_SOURCE);
        insertedOrUpdated += 1;
      }

      await updateEventSyncState(channel, syncKey, toBlock, latestBlock);
      cursor = toBlock + 1n;
    }
  }
  return insertedOrUpdated;
}

function rawHistoryFiles(historyDir: string) {
  return fs.readdirSync(historyDir)
    .filter((file) => file.startsWith("eth_getLogs.") && file.endsWith(".json"))
    .map((file) => path.join(historyDir, file))
    .sort();
}

async function getRawHistoryEntriesProcessed(channel: ObserverChannelConfig, filePath: string) {
  const sql = getSql();
  const rows = await sql`
    select entries_processed
    from observer_raw_history_import_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
      and file_path = ${filePath}
    limit 1
  ` as { entries_processed: number }[];
  return rows[0]?.entries_processed ?? 0;
}

async function updateRawHistoryEntriesProcessed(channel: ObserverChannelConfig, filePath: string, entriesProcessed: number) {
  const sql = getSql();
  await sql`
    insert into observer_raw_history_import_state (chain_id, channel_id, file_path, entries_processed, updated_at)
    values (${String(channel.chainId)}::bigint, ${channel.channelId}, ${filePath}, ${String(entriesProcessed)}::integer, now())
    on conflict (chain_id, channel_id, file_path) do update set
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
  chainId: number,
  logs: DecodedObserverLog[],
) {
  const timestamps = new Map<string, string>();
  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber.toString()))];
  const missing: bigint[] = [];
  const sql = getSql();

  for (const blockNumber of blockNumbers) {
    const rows = await sql`
      select block_timestamp
      from observer_blocks
      where chain_id = ${String(chainId)}::bigint
        and block_number = ${blockNumber}::bigint
      limit 1
    ` as { block_timestamp: string }[];
    if (rows[0]?.block_timestamp) {
      timestamps.set(blockNumber, rows[0].block_timestamp);
    } else {
      missing.push(BigInt(blockNumber));
    }
  }

  for (const blockNumber of missing) {
    const block = await client.getBlock({ blockNumber });
    const timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
    timestamps.set(blockNumber.toString(), timestamp);
    await sql`
      insert into observer_blocks (chain_id, block_number, block_hash, block_timestamp, updated_at)
      values (
        ${String(chainId)}::bigint,
        ${blockNumber.toString()}::bigint,
        ${block.hash ?? "0x"},
        ${timestamp}::timestamptz,
        now()
      )
      on conflict (chain_id, block_number) do update set
        block_hash = excluded.block_hash,
        block_timestamp = excluded.block_timestamp,
        updated_at = now()
    `;
  }

  return timestamps;
}

async function insertObserverEvent(
  channel: ObserverChannelConfig,
  log: DecodedObserverLog,
  blockTimestamp: string | null,
  source: string,
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
      raw_data,
      ingestion_sources
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
      ${log.data},
      ${JSON.stringify([source])}::jsonb
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
      raw_data = excluded.raw_data,
      ingestion_sources = (
        select jsonb_agg(distinct source_value)
        from jsonb_array_elements_text(observer_events.ingestion_sources || excluded.ingestion_sources) as merged(source_value)
      )
  `;
}

function abiEvent(eventName: string) {
  const event = observerAbi.find((item) => item.type === "event" && item.name === eventName) as AbiEvent | undefined;
  if (!event) {
    throw new Error(`Observer ABI does not contain event ${eventName}.`);
  }
  return event;
}

function addressForTarget(channel: ObserverChannelConfig, addressKey: (typeof TARGETED_EVENTS)[number]["addressKey"]) {
  return channel[addressKey] as Address;
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

export function zeroAddress() {
  return ZERO_ADDRESS;
}
