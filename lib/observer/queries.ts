import { getSql } from "../db";

export type ObserverChannelRow = {
  chain_id: string;
  channel_id: string;
  slug: string;
  name: string;
  dapp_id: string;
  genesis_block: string;
  channel_registration_tx: string | null;
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
  dapp_manager: string | null;
  channel_deployer: string | null;
  bridge_core_implementation: string | null;
  bridge_token_vault_implementation: string | null;
  current_join_toll: string | null;
  current_root_vector_hash: string | null;
  current_state_refreshed_at: string | null;
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

export type ObserverEventListName =
  | "bridgeEvents"
  | "participantEvents"
  | "commitmentEvents"
  | "encryptedPayloadEvents"
  | "privateStateEvents";

export type ObserverEventListPage = {
  limit: number;
  offset: number;
};

export type ObserverDashboardOptions = {
  eventListPages?: Partial<Record<ObserverEventListName, ObserverEventListPage>>;
};

export type ObserverDashboard = {
  channel: ObserverChannelRow;
  sync: {
    lastScannedBlock: string | null;
    latestBlock: string | null;
    updatedAt: string | null;
  };
  stats: {
    channelCreated: ObserverEventRow | null;
    latestAcceptedTransition: ObserverEventRow | null;
    totalL1BridgeDeposits: string;
    totalL1BridgeWithdrawals: string;
    channelParticipantsCount: string;
    joinedParticipantsCount: string;
    exitedParticipantsCount: string;
    eventCounts: Record<string, string>;
  };
  lists: {
    bridgeEvents: ObserverEventRow[];
    participantEvents: ObserverEventRow[];
    commitmentEvents: ObserverEventRow[];
    nullifierEvents: ObserverEventRow[];
    encryptedPayloadEvents: ObserverEventRow[];
    privateStateEvents: ObserverEventRow[];
    policyEvents: ObserverEventRow[];
    transitionEvents: ObserverEventRow[];
    verifierEvents: ObserverEventRow[];
    adminEvents: ObserverEventRow[];
    upgradeEvents: ObserverEventRow[];
  };
  listTotals: Record<ObserverEventListName, string>;
};

export async function getObserverDashboard(
  slug: string,
  options: ObserverDashboardOptions = {},
): Promise<ObserverDashboard | null> {
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

  const [syncRows, channelCreatedRows, latestTransitions, totals, participantRows, countRows] = await Promise.all([
    sql`
      select last_scanned_block, latest_block, updated_at
      from observer_sync_state
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
      limit 1
    ` as unknown as Promise<{ last_scanned_block: string; latest_block: string | null; updated_at: string }[]>,
    eventRows(channel, { eventName: "ChannelCreated", limit: 1, sort: "asc" }),
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
      select
        (select count(*) from registered where l1_address is not null)::text as joined_count,
        (select count(*) from exited where l1_address is not null)::text as exited_count,
        (
          select count(*)
          from registered
          where l1_address is not null
            and l1_address not in (select l1_address from exited where l1_address is not null)
        )::text as active_count
    ` as unknown as Promise<{ active_count: string; joined_count: string; exited_count: string }[]>,
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
    bridgeList,
    participantList,
    storageList,
    encryptedPayloadList,
    privateStateList,
    policyEvents,
    transitionEvents,
    verifierEvents,
    adminEvents,
    upgradeEvents,
  ] = await Promise.all([
    eventListByGroups(channel, ["deposit", "withdrawal"], pageFor(options, "bridgeEvents")),
    eventListByGroups(channel, ["participant"], pageFor(options, "participantEvents")),
    eventListRows(channel, { eventName: "StorageKeyObserved", ...pageFor(options, "commitmentEvents") }),
    eventListRows(channel, { eventName: "NoteValueEncrypted", ...pageFor(options, "encryptedPayloadEvents") }),
    eventListByGroups(channel, ["transition", "commitment_or_nullifier", "encrypted_payload", "l2_accounting"], pageFor(options, "privateStateEvents")),
    eventRows(channel, { eventGroup: "policy", limit: 100 }),
    eventRows(channel, { eventGroup: "transition", limit: 100 }),
    eventRows(channel, { eventGroup: "verifier", limit: 100 }),
    eventRows(channel, { eventGroup: "admin", limit: 100 }),
    eventRows(channel, { eventGroup: "upgrade", limit: 100 }),
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
      channelCreated: channelCreatedRows[0] ?? null,
      latestAcceptedTransition: latestTransitions[0] ?? null,
      totalL1BridgeDeposits: totals[0]?.deposits ?? "0",
      totalL1BridgeWithdrawals: totals[0]?.withdrawals ?? "0",
      channelParticipantsCount: participantRows[0]?.active_count ?? "0",
      joinedParticipantsCount: participantRows[0]?.joined_count ?? "0",
      exitedParticipantsCount: participantRows[0]?.exited_count ?? "0",
      eventCounts,
    },
    lists: {
      bridgeEvents: bridgeList.rows,
      participantEvents: participantList.rows,
      commitmentEvents: storageList.rows,
      nullifierEvents: storageList.rows,
      encryptedPayloadEvents: encryptedPayloadList.rows,
      privateStateEvents: privateStateList.rows,
      policyEvents,
      transitionEvents,
      verifierEvents,
      adminEvents,
      upgradeEvents,
    },
    listTotals: {
      bridgeEvents: bridgeList.totalCount,
      participantEvents: participantList.totalCount,
      commitmentEvents: storageList.totalCount,
      encryptedPayloadEvents: encryptedPayloadList.totalCount,
      privateStateEvents: privateStateList.totalCount,
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
  filters: { eventGroup?: string; eventName?: string; excludedGroups?: string[]; limit?: number; offset?: number; sort?: "asc" | "desc" },
) {
  const sql = getSql();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const excludedGroups = filters.excludedGroups ?? [];
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
      and (cardinality(${excludedGroups}::text[]) = 0 or event_group <> all(${excludedGroups}::text[]))
    order by
      case when ${filters.sort ?? "desc"} = 'asc' then block_number end asc,
      case when ${filters.sort ?? "desc"} = 'asc' then log_index end asc,
      case when ${filters.sort ?? "desc"} = 'desc' then block_number end desc,
      case when ${filters.sort ?? "desc"} = 'desc' then log_index end desc
    limit ${String(limit)}::integer
    offset ${String(offset)}::integer
  ` as ObserverEventRow[];
  return rows;
}

async function eventListRows(
  channel: ObserverChannelRow,
  filters: { eventGroup?: string; eventName?: string; excludedGroups?: string[]; limit: number; offset: number; sort?: "asc" | "desc" },
) {
  const [rows, totalCount] = await Promise.all([
    eventRows(channel, filters),
    eventCount(channel, filters),
  ]);
  return { rows, totalCount };
}

async function eventListByGroups(
  channel: ObserverChannelRow,
  eventGroups: string[],
  page: ObserverEventListPage,
) {
  const sql = getSql();
  const limit = Math.min(Math.max(page.limit, 1), 500);
  const offset = Math.max(page.offset, 0);
  const [rows, countRows] = await Promise.all([
    sql`
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
      offset ${String(offset)}::integer
    ` as unknown as Promise<ObserverEventRow[]>,
    sql`
      select count(*)::text as count
      from observer_events
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
        and event_group = any(${eventGroups}::text[])
    ` as unknown as Promise<{ count: string }[]>,
  ]);
  return { rows, totalCount: countRows[0]?.count ?? "0" };
}

async function eventCount(
  channel: ObserverChannelRow,
  filters: { eventGroup?: string; eventName?: string; excludedGroups?: string[] },
) {
  const sql = getSql();
  const excludedGroups = filters.excludedGroups ?? [];
  const rows = await sql`
    select count(*)::text as count
    from observer_events
    where chain_id = ${channel.chain_id}::bigint
      and channel_id = ${channel.channel_id}
      and (${filters.eventGroup ?? null}::text is null or event_group = ${filters.eventGroup ?? null})
      and (${filters.eventName ?? null}::text is null or event_name = ${filters.eventName ?? null})
      and (cardinality(${excludedGroups}::text[]) = 0 or event_group <> all(${excludedGroups}::text[]))
  ` as { count: string }[];
  return rows[0]?.count ?? "0";
}

function pageFor(options: ObserverDashboardOptions, listName: ObserverEventListName): ObserverEventListPage {
  return options.eventListPages?.[listName] ?? { limit: 100, offset: 0 };
}
