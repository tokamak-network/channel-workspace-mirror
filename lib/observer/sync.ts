import { createPublicClient, decodeEventLog, http, type Address, type Log } from "viem";
import { observerAbi, eventGroupFor } from "./abi";
import {
  DEFAULT_OBSERVER_CHANNEL,
  getObserverBatchSize,
  getObserverConfirmations,
  getObserverRpcUrl,
  type ObserverChannelConfig,
} from "./config";
import { getSql } from "../db";

type SyncResult = {
  channel: string;
  fromBlock: string;
  toBlock: string;
  latestBlock: string;
  insertedOrUpdated: number;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function syncDefaultObserverChannel(): Promise<SyncResult> {
  return syncObserverChannel(DEFAULT_OBSERVER_CHANNEL);
}

export async function syncObserverChannel(channel: ObserverChannelConfig): Promise<SyncResult> {
  const sql = getSql();
  await upsertChannel(channel);

  const client = createPublicClient({
    transport: http(getObserverRpcUrl()),
  });
  const latestBlock = await client.getBlockNumber();
  const confirmations = getObserverConfirmations();
  const safeLatestBlock = latestBlock > confirmations ? latestBlock - confirmations : 0n;
  const state = await getSyncState(channel);
  const fromBlock = (state?.last_scanned_block ? BigInt(state.last_scanned_block) + 1n : channel.genesisBlock);

  if (fromBlock > safeLatestBlock) {
    await updateSyncState(channel, state?.last_scanned_block ? BigInt(state.last_scanned_block) : channel.genesisBlock - 1n, latestBlock);
    return {
      channel: channel.slug,
      fromBlock: fromBlock.toString(),
      toBlock: safeLatestBlock.toString(),
      latestBlock: latestBlock.toString(),
      insertedOrUpdated: 0,
    };
  }

  const batchSize = BigInt(getObserverBatchSize());
  const addresses = observerAddresses(channel);
  let cursor = fromBlock;
  let insertedOrUpdated = 0;

  while (cursor <= safeLatestBlock) {
    const toBlock = minBigInt(cursor + batchSize - 1n, safeLatestBlock);
    const logs = await client.getLogs({
      address: addresses,
      fromBlock: cursor,
      toBlock,
    });
    const relevantLogs = decodeRelevantLogs(channel, logs);
    const timestamps = await blockTimestamps(client, relevantLogs);

    for (const decoded of relevantLogs) {
      await insertObserverEvent(channel, decoded, timestamps.get(decoded.blockNumber.toString()) ?? null);
      insertedOrUpdated += 1;
    }

    await updateSyncState(channel, toBlock, latestBlock);
    cursor = toBlock + 1n;
  }

  await sql`select 1`;
  return {
    channel: channel.slug,
    fromBlock: fromBlock.toString(),
    toBlock: safeLatestBlock.toString(),
    latestBlock: latestBlock.toString(),
    insertedOrUpdated,
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

async function getSyncState(channel: ObserverChannelConfig) {
  const sql = getSql();
  const rows = await sql`
    select last_scanned_block
    from observer_sync_state
    where chain_id = ${String(channel.chainId)}::bigint
      and channel_id = ${channel.channelId}
  ` as { last_scanned_block: string }[];
  return rows[0] ?? null;
}

async function updateSyncState(channel: ObserverChannelConfig, lastScannedBlock: bigint, latestBlock: bigint) {
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

function observerAddresses(channel: ObserverChannelConfig) {
  return [
    channel.bridgeCore,
    channel.channelManager,
    channel.bridgeTokenVault,
    channel.controller,
    channel.l2AccountingVault,
  ] as Address[];
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
  if (eventName === "ChannelJoinTollPaid" || eventName === "ChannelExitRefunded") {
    return lowerAddress === channel.bridgeTokenVault.toLowerCase();
  }
  return lowerAddress === channel.channelManager.toLowerCase();
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
  logs: DecodedObserverLog[],
) {
  const timestamps = new Map<string, string>();
  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber.toString()))];
  for (const blockNumber of blockNumbers) {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    timestamps.set(blockNumber, new Date(Number(block.timestamp) * 1000).toISOString());
  }
  return timestamps;
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

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

export function zeroAddress() {
  return ZERO_ADDRESS;
}
