import { getSql } from "../db";

export type ObserverChannelRow = {
  chain_id: string;
  channel_id: string;
  slug: string;
  name: string;
  dapp_id: string;
  genesis_block: string;
  bridge_core: string;
  channel_manager: string;
  bridge_token_vault: string;
  canonical_asset: string | null;
  controller: string | null;
  l2_accounting_vault: string | null;
  leader: string | null;
  dapp_metadata_digest_schema: string | null;
  dapp_metadata_digest: string | null;
  function_root: string | null;
  groth_verifier: string | null;
  groth_verifier_version: string | null;
  tokamak_verifier: string | null;
  tokamak_verifier_version: string | null;
  source_code_url: string | null;
  abi_url: string | null;
  admin_wallet: string | null;
  incident_notice: string | null;
  updated_at: string;
};

export type ObserverEventRow = {
  id: string;
  block_number: string;
  block_timestamp: string | null;
  transaction_hash: string;
  log_index: number;
  contract_address: string;
  event_name: string;
  event_group: string;
  decoded: Record<string, unknown>;
};

export type ObserverDashboard = {
  channel: ObserverChannelRow;
  sync: {
    lastScannedBlock: string | null;
    latestBlock: string | null;
    updatedAt: string | null;
  };
  stats: {
    latestAcceptedTransition: ObserverEventRow | null;
    totalL1BridgeDeposits: string;
    totalL1BridgeWithdrawals: string;
    channelParticipantsCount: string;
    eventCounts: Record<string, string>;
  };
  lists: {
    bridgeEvents: ObserverEventRow[];
    channelJoins: ObserverEventRow[];
    registeredAddressPairs: ObserverEventRow[];
    noteReceivePublicKeys: ObserverEventRow[];
    commitmentEvents: ObserverEventRow[];
    nullifierEvents: ObserverEventRow[];
    encryptedPayloadEvents: ObserverEventRow[];
    upgradeHistory: ObserverEventRow[];
    recentEvents: ObserverEventRow[];
  };
};

export async function getObserverDashboard(slug: string): Promise<ObserverDashboard | null> {
  const sql = getSql();
  const channels = await sql`
    select *
    from observer_channels
    where slug = ${slug}
    limit 1
  ` as ObserverChannelRow[];
  const channel = channels[0];
  if (!channel) {
    return null;
  }

  const [syncRows, latestTransitions, totals, participantRows, countRows] = await Promise.all([
    sql`
      select last_scanned_block, latest_block, updated_at
      from observer_sync_state
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
      limit 1
    ` as unknown as Promise<{ last_scanned_block: string; latest_block: string | null; updated_at: string }[]>,
    eventRows(channel, { eventName: "CurrentRootVectorObserved", limit: 1 }),
    sql`
      select
        coalesce(sum(case when event_name = 'AssetsFunded' then (decoded->>'amount')::numeric else 0 end), 0)::text as deposits,
        coalesce(sum(case when event_name = 'AssetsClaimed' then (decoded->>'amount')::numeric else 0 end), 0)::text as withdrawals
      from observer_events
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
    ` as unknown as Promise<{ deposits: string; withdrawals: string }[]>,
    sql`
      with registered as (
        select distinct decoded->>'l1Address' as l1_address
        from observer_events
        where chain_id = ${channel.chain_id}::bigint
          and channel_id = ${channel.channel_id}
          and event_name = 'ChannelTokenVaultIdentityRegistered'
      ),
      exited as (
        select distinct decoded->>'l1Address' as l1_address
        from observer_events
        where chain_id = ${channel.chain_id}::bigint
          and channel_id = ${channel.channel_id}
          and event_name = 'ChannelTokenVaultIdentityExited'
      )
      select count(*)::text as active_count
      from registered
      where l1_address is not null
        and l1_address not in (select l1_address from exited where l1_address is not null)
    ` as unknown as Promise<{ active_count: string }[]>,
    sql`
      select event_group, count(*)::text as count
      from observer_events
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
      group by event_group
      order by event_group
    ` as unknown as Promise<{ event_group: string; count: string }[]>,
  ]);

  const [
    bridgeEvents,
    channelJoins,
    storageEvents,
    encryptedPayloadEvents,
    upgradeHistory,
    recentEvents,
  ] = await Promise.all([
    eventRowsByGroups(channel, ["deposit", "withdrawal"], 100),
    eventRows(channel, { eventName: "ChannelTokenVaultIdentityRegistered", limit: 100 }),
    eventRows(channel, { eventName: "StorageKeyObserved", limit: 100 }),
    eventRows(channel, { eventName: "NoteValueEncrypted", limit: 100 }),
    eventRows(channel, { eventGroup: "upgrade", limit: 100 }),
    eventRows(channel, { limit: 100 }),
  ]);

  const eventCounts: Record<string, string> = {};
  for (const row of countRows) {
    eventCounts[row.event_group] = row.count;
  }

  return {
    channel,
    sync: {
      lastScannedBlock: syncRows[0]?.last_scanned_block ?? null,
      latestBlock: syncRows[0]?.latest_block ?? null,
      updatedAt: syncRows[0]?.updated_at ?? null,
    },
    stats: {
      latestAcceptedTransition: latestTransitions[0] ?? null,
      totalL1BridgeDeposits: totals[0]?.deposits ?? "0",
      totalL1BridgeWithdrawals: totals[0]?.withdrawals ?? "0",
      channelParticipantsCount: participantRows[0]?.active_count ?? "0",
      eventCounts,
    },
    lists: {
      bridgeEvents,
      channelJoins,
      registeredAddressPairs: channelJoins,
      noteReceivePublicKeys: channelJoins,
      commitmentEvents: storageEvents,
      nullifierEvents: storageEvents,
      encryptedPayloadEvents,
      upgradeHistory,
      recentEvents,
    },
  };
}

export async function getObserverEvents(slug: string, filters: { group?: string; event?: string; limit?: number }) {
  const dashboard = await getObserverDashboard(slug);
  if (!dashboard) {
    return null;
  }
  return eventRows(dashboard.channel, {
    eventGroup: filters.group,
    eventName: filters.event,
    limit: filters.limit ?? 100,
  });
}

async function eventRows(
  channel: ObserverChannelRow,
  filters: { eventGroup?: string; eventName?: string; limit?: number },
) {
  const sql = getSql();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = await sql`
    select
      id::text,
      block_number::text,
      block_timestamp,
      transaction_hash,
      log_index,
      contract_address,
      event_name,
      event_group,
      decoded
    from observer_events
    where chain_id = ${channel.chain_id}::bigint
      and channel_id = ${channel.channel_id}
      and (${filters.eventGroup ?? null}::text is null or event_group = ${filters.eventGroup ?? null})
      and (${filters.eventName ?? null}::text is null or event_name = ${filters.eventName ?? null})
    order by block_number desc, log_index desc
    limit ${String(limit)}::integer
  ` as ObserverEventRow[];
  return rows;
}

async function eventRowsByGroups(
  channel: ObserverChannelRow,
  eventGroups: string[],
  limitValue: number,
) {
  const sql = getSql();
  const limit = Math.min(Math.max(limitValue, 1), 500);
  const rows = await sql`
    select
      id::text,
      block_number::text,
      block_timestamp,
      transaction_hash,
      log_index,
      contract_address,
      event_name,
      event_group,
      decoded
    from observer_events
    where chain_id = ${channel.chain_id}::bigint
      and channel_id = ${channel.channel_id}
      and event_group = any(${eventGroups}::text[])
    order by block_number desc, log_index desc
    limit ${String(limit)}::integer
  ` as ObserverEventRow[];
  return rows;
}
