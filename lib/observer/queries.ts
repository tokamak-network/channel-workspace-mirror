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
  join_toll_burn_address: string | null;
  channel_operation_abandoned_at: string | null;
  toll_refund_cutoff1_seconds: string | null;
  toll_refund_cutoff2_seconds: string | null;
  toll_refund_cutoff3_seconds: string | null;
  toll_refund_bps1: string | null;
  toll_refund_bps2: string | null;
  toll_refund_bps3: string | null;
  toll_refund_bps4: string | null;
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

export type ObserverIncidentRow = {
  id: string;
  chain_id: string;
  channel_id: string;
  status: string;
  severity: string;
  title: string;
  body: string;
  reference_url: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ObserverEventListName =
  | "bridgeEvents"
  | "participantJoinEvents"
  | "participantAddressPairEvents"
  | "participantPublicKeyEvents"
  | "participantExitEvents"
  | "commitmentEvents"
  | "encryptedPayloadEvents"
  | "privateStateEvents";

export type ObserverEventListPage = {
  limit: number;
  offset: number;
};

export type ObserverDashboardOptions = {
  listMode?: "all" | "events" | "upgrades" | "none";
  includeIncidents?: boolean | "active";
  includeParticipantAccounting?: boolean;
  eventListLimit?: number;
  eventListPages?: Partial<Record<ObserverEventListName, ObserverEventListPage>>;
  eventLists?: ObserverEventListName[];
};

export type ObserverDashboard = {
  channel: ObserverChannelRow;
  sync: {
    lastScannedBlock: string | null;
    latestBlock: string | null;
    updatedAt: string | null;
    status: "ok" | "issue";
    message: string | null;
  };
  stats: {
    channelCreated: ObserverEventRow | null;
    latestAcceptedTransition: ObserverEventRow | null;
    totalL1BridgeDeposits: string;
    totalL1BridgeWithdrawals: string;
    channelParticipantsCount: string;
    joinedParticipantsCount: string;
    exitedParticipantsCount: string;
    realizedBurntToll: string | null;
    eventCounts: Record<string, string>;
  };
  lists: {
    bridgeEvents: ObserverEventRow[];
    participantJoinEvents: ObserverEventRow[];
    participantAddressPairEvents: ObserverEventRow[];
    participantPublicKeyEvents: ObserverEventRow[];
    participantExitEvents: ObserverEventRow[];
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
  incidents: {
    active: ObserverIncidentRow[];
    history: ObserverIncidentRow[];
  };
  listTotals: Record<ObserverEventListName, string>;
};

const EMPTY_LIST_TOTALS: Record<ObserverEventListName, string> = {
  bridgeEvents: "0",
  participantJoinEvents: "0",
  participantAddressPairEvents: "0",
  participantPublicKeyEvents: "0",
  participantExitEvents: "0",
  commitmentEvents: "0",
  encryptedPayloadEvents: "0",
  privateStateEvents: "0",
};

const DECODED_FIELDS = {
  bridge: ["user", "channelId", "amount", "refundBps", "burnAddress"],
  channelCreated: ["channelId", "dappId", "manager", "bridgeTokenVault"],
  transition: ["rootVectorHash"],
  participantJoin: ["l1Address", "l2Address", "channelTokenVaultKey", "leafIndex", "joinTollPaid", "joinedAt", "noteReceivePubKeyX", "noteReceivePubKeyYParity"],
  participantExit: ["l1Address", "leafIndex"],
  commitment: ["storageKey"],
  encryptedPayload: ["encryptedNoteValue"],
  privateState: ["rootVectorHash", "storageAddr", "storageKey", "value", "l2Address"],
  policy: ["previousJoinToll", "newJoinToll", "cutoff1", "bps1", "cutoff2", "bps2", "cutoff3", "bps3", "bps4", "channelId", "leader", "abandonedAt"],
  verifier: ["grothVerifier", "tokamakVerifier"],
  admin: ["previousOwner", "newOwner"],
  upgrade: ["implementation"],
  api: ["user", "channelId", "amount", "refundBps", "burnAddress", "leader", "abandonedAt", "l1Address", "l2Address", "channelTokenVaultKey", "leafIndex", "joinedAt", "rootVectorHash", "storageKey", "encryptedNoteValue", "implementation"],
} as const;

type EventQueryFilters = {
  eventGroup?: string;
  eventName?: string;
  excludedGroups?: string[];
  decodedFields?: readonly string[];
  limit?: number;
  offset?: number;
  sort?: "asc" | "desc";
};

export async function getObserverDashboard(
  slug: string,
  options: ObserverDashboardOptions = {},
): Promise<ObserverDashboard | null> {
  const channel = await getObserverChannel(slug);
  if (!channel) {
    return null;
  }

  const sql = getSql();
  const [syncRows, phaseRows, channelCreatedRows, latestTransitions, totals, participantRows, burntTollRows, countRows] = await Promise.all([
    sql`
      select last_scanned_block, latest_block, updated_at
      from observer_sync_state
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
      limit 1
    ` as unknown as Promise<{ last_scanned_block: string; latest_block: string | null; updated_at: string }[]>,
    sql`
      select phase, status
      from indexer_phase_state
      where channel_slug = ${channel.slug}
    ` as unknown as Promise<{ phase: string; status: string }[]>,
    eventRows(channel, { eventName: "ChannelCreated", decodedFields: DECODED_FIELDS.channelCreated, limit: 1, sort: "asc" }),
    eventRows(channel, { eventName: "CurrentRootVectorObserved", decodedFields: DECODED_FIELDS.transition, limit: 1 }),
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
    options.includeParticipantAccounting
      ? realizedBurntTollRows(channel)
      : Promise.resolve([{ realized_burnt_toll: null }]),
    sql`
      select event_group, count(*)::text as count
      from observer_events
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
      group by event_group
      order by event_group
    ` as unknown as Promise<{ event_group: string; count: string }[]>,
  ]);

  const listMode = options.listMode ?? "all";
  const lists = emptyEventLists();
  const listTotals = { ...EMPTY_LIST_TOTALS };

  if (listMode === "all" || listMode === "events") {
    Object.assign(listTotals, await eventListTotals(channel));
    const selectedLists = selectedEventLists(options, listMode);

    if (selectedLists.has("bridgeEvents")) {
      lists.bridgeEvents = (await eventListByGroups(channel, ["deposit", "withdrawal"], pageFor(options, "bridgeEvents"), DECODED_FIELDS.bridge)).rows;
    }

    if (
      selectedLists.has("participantJoinEvents")
      || selectedLists.has("participantAddressPairEvents")
      || selectedLists.has("participantPublicKeyEvents")
    ) {
      const participantRegistrationLists = await participantRegistrationListRows(channel, options);
      lists.participantJoinEvents = participantRegistrationLists.participantJoinEvents.rows;
      lists.participantAddressPairEvents = participantRegistrationLists.participantAddressPairEvents.rows;
      lists.participantPublicKeyEvents = participantRegistrationLists.participantPublicKeyEvents.rows;
    }

    if (selectedLists.has("participantExitEvents")) {
      lists.participantExitEvents = (await eventListRows(channel, {
        eventName: "ChannelTokenVaultIdentityExited",
        decodedFields: DECODED_FIELDS.participantExit,
        ...pageFor(options, "participantExitEvents"),
      })).rows;
    }

    if (selectedLists.has("commitmentEvents")) {
      const storageList = await eventListRows(channel, {
        eventName: "StorageKeyObserved",
        decodedFields: DECODED_FIELDS.commitment,
        ...pageFor(options, "commitmentEvents"),
      });
      lists.commitmentEvents = storageList.rows;
      lists.nullifierEvents = storageList.rows;
    }

    if (selectedLists.has("encryptedPayloadEvents")) {
      lists.encryptedPayloadEvents = (await eventListRows(channel, {
        eventName: "NoteValueEncrypted",
        decodedFields: DECODED_FIELDS.encryptedPayload,
        ...pageFor(options, "encryptedPayloadEvents"),
      })).rows;
    }

    if (selectedLists.has("privateStateEvents")) {
      lists.privateStateEvents = (await eventListByGroups(
        channel,
        ["transition", "l2_accounting"],
        pageFor(options, "privateStateEvents"),
        DECODED_FIELDS.privateState,
      )).rows;
    }
  }

  if (listMode === "all" || listMode === "upgrades") {
    const [policyEvents, transitionEvents, verifierEvents, adminEvents, upgradeEvents] = await Promise.all([
      eventRows(channel, { eventGroup: "policy", decodedFields: DECODED_FIELDS.policy, limit: eventListLimit(options) }),
      eventRows(channel, { eventGroup: "transition", decodedFields: DECODED_FIELDS.transition, limit: eventListLimit(options) }),
      eventRows(channel, { eventGroup: "verifier", decodedFields: DECODED_FIELDS.verifier, limit: eventListLimit(options) }),
      eventRows(channel, { eventGroup: "admin", decodedFields: DECODED_FIELDS.admin, limit: eventListLimit(options) }),
      eventRows(channel, { eventGroup: "upgrade", decodedFields: DECODED_FIELDS.upgrade, limit: eventListLimit(options) }),
    ]);
    lists.policyEvents = policyEvents;
    lists.transitionEvents = transitionEvents;
    lists.verifierEvents = verifierEvents;
    lists.adminEvents = adminEvents;
    lists.upgradeEvents = upgradeEvents;
  }

  const includeIncidents = options.includeIncidents ?? true;
  const [activeIncidents, incidentHistory] = includeIncidents
    ? await Promise.all([
      incidentRows(channel, { activeOnly: true, limit: 20 }),
      includeIncidents === "active" ? Promise.resolve([]) : incidentRows(channel, { limit: 100 }),
    ])
    : [[], []];

  const eventCounts: Record<string, string> = {};
  for (const row of countRows) {
    eventCounts[row.event_group] = row.count;
  }
  const hasDataIssue = syncRows.length === 0 || phaseRows.some((row) => row.status === "failed");

  return {
    channel,
    sync: {
      lastScannedBlock: syncRows[0]?.last_scanned_block ?? null,
      latestBlock: syncRows[0]?.latest_block ?? null,
      updatedAt: syncRows[0]?.updated_at ?? null,
      status: hasDataIssue ? "issue" : "ok",
      message: hasDataIssue ? "Observer data is currently unavailable." : null,
    },
    stats: {
      channelCreated: channelCreatedRows[0] ?? null,
      latestAcceptedTransition: latestTransitions[0] ?? null,
      totalL1BridgeDeposits: totals[0]?.deposits ?? "0",
      totalL1BridgeWithdrawals: totals[0]?.withdrawals ?? "0",
      channelParticipantsCount: participantRows[0]?.active_count ?? "0",
      joinedParticipantsCount: participantRows[0]?.joined_count ?? "0",
      exitedParticipantsCount: participantRows[0]?.exited_count ?? "0",
      realizedBurntToll: burntTollRows[0]?.realized_burnt_toll ?? null,
      eventCounts,
    },
    lists,
    incidents: {
      active: activeIncidents,
      history: incidentHistory,
    },
    listTotals,
  };
}

async function participantRegistrationListRows(
  channel: ObserverChannelRow,
  options: ObserverDashboardOptions,
) {
  const participantJoinPage = pageFor(options, "participantJoinEvents");
  const participantAddressPairPage = pageFor(options, "participantAddressPairEvents");
  const participantPublicKeyPage = pageFor(options, "participantPublicKeyEvents");
  if (
    samePage(participantJoinPage, participantAddressPairPage)
    && samePage(participantJoinPage, participantPublicKeyPage)
  ) {
    const rows = await eventListRows(channel, {
      eventName: "ChannelTokenVaultIdentityRegistered",
      decodedFields: DECODED_FIELDS.participantJoin,
      ...participantJoinPage,
    });
    return {
      participantJoinEvents: rows,
      participantAddressPairEvents: rows,
      participantPublicKeyEvents: rows,
    };
  }

  const [participantJoinEvents, participantAddressPairEvents, participantPublicKeyEvents] = await Promise.all([
    eventListRows(channel, { eventName: "ChannelTokenVaultIdentityRegistered", decodedFields: DECODED_FIELDS.participantJoin, ...participantJoinPage }),
    eventListRows(channel, { eventName: "ChannelTokenVaultIdentityRegistered", decodedFields: DECODED_FIELDS.participantJoin, ...participantAddressPairPage }),
    eventListRows(channel, { eventName: "ChannelTokenVaultIdentityRegistered", decodedFields: DECODED_FIELDS.participantJoin, ...participantPublicKeyPage }),
  ]);
  return {
    participantJoinEvents,
    participantAddressPairEvents,
    participantPublicKeyEvents,
  };
}

async function eventListTotals(channel: ObserverChannelRow) {
  const sql = getSql();
  const rows = await sql`
    select
      count(*) filter (where event_group = any(${["deposit", "withdrawal"]}::text[]))::text as bridge_events,
      count(*) filter (where event_name = 'ChannelTokenVaultIdentityRegistered')::text as participant_registration_events,
      count(*) filter (where event_name = 'ChannelTokenVaultIdentityExited')::text as participant_exit_events,
      count(*) filter (where event_name = 'StorageKeyObserved')::text as commitment_events,
      count(*) filter (where event_name = 'NoteValueEncrypted')::text as encrypted_payload_events,
      count(*) filter (where event_group = any(${["transition", "l2_accounting"]}::text[]))::text as private_state_events
    from observer_events
    where chain_id = ${channel.chain_id}::bigint
      and channel_id = ${channel.channel_id}
  ` as unknown as {
    bridge_events: string;
    participant_registration_events: string;
    participant_exit_events: string;
    commitment_events: string;
    encrypted_payload_events: string;
    private_state_events: string;
  }[];
  const row = rows[0];
  return {
    bridgeEvents: row?.bridge_events ?? "0",
    participantJoinEvents: row?.participant_registration_events ?? "0",
    participantAddressPairEvents: row?.participant_registration_events ?? "0",
    participantPublicKeyEvents: row?.participant_registration_events ?? "0",
    participantExitEvents: row?.participant_exit_events ?? "0",
    commitmentEvents: row?.commitment_events ?? "0",
    encryptedPayloadEvents: row?.encrypted_payload_events ?? "0",
    privateStateEvents: row?.private_state_events ?? "0",
  };
}

async function realizedBurntTollRows(channel: ObserverChannelRow) {
  const sql = getSql();
  return sql`
    with exits as (
      select
        lower(decoded->>'l1Address') as l1_address,
        decoded->>'leafIndex' as leaf_index,
        block_number,
        log_index,
        transaction_hash
      from observer_events
      where chain_id = ${channel.chain_id}::bigint
        and channel_id = ${channel.channel_id}
        and event_name = 'ChannelTokenVaultIdentityExited'
    ),
    matched as (
      select
        joined.join_toll_paid,
        refunded.refund_amount
      from exits
      left join lateral (
        select (decoded->>'joinTollPaid')::numeric as join_toll_paid
        from observer_events
        where chain_id = ${channel.chain_id}::bigint
          and channel_id = ${channel.channel_id}
          and event_name = 'ChannelTokenVaultIdentityRegistered'
          and lower(decoded->>'l1Address') = exits.l1_address
          and decoded->>'leafIndex' = exits.leaf_index
          and (
            block_number < exits.block_number
            or (block_number = exits.block_number and log_index < exits.log_index)
          )
        order by block_number desc, log_index desc
        limit 1
      ) joined on true
      left join lateral (
        select (decoded->>'amount')::numeric as refund_amount
        from observer_events
        where chain_id = ${channel.chain_id}::bigint
          and channel_id = ${channel.channel_id}
          and event_name = 'ChannelExitRefunded'
          and transaction_hash = exits.transaction_hash
          and lower(decoded->>'user') = exits.l1_address
        order by log_index asc
        limit 1
      ) refunded on true
    )
    select coalesce(sum(join_toll_paid - refund_amount), 0)::text as realized_burnt_toll
    from matched
    where join_toll_paid is not null
      and refund_amount is not null
  ` as unknown as Promise<{ realized_burnt_toll: string }[]>;
}

export async function getObserverEvents(slug: string, filters: { group?: string; event?: string; limit?: number }) {
  const channel = await getObserverChannel(slug);
  if (!channel) {
    return null;
  }
  return eventRows(channel, {
    eventGroup: filters.group,
    eventName: filters.event,
    decodedFields: decodedFieldsForEventFilters(filters),
    limit: filters.limit ?? 100,
  });
}

async function getObserverChannel(slug: string) {
  const sql = getSql();
  const channels = await sql`
    select *
    from observer_channels
    where slug = ${slug}
    limit 1
  ` as ObserverChannelRow[];
  return channels[0] ?? null;
}

async function eventRows(channel: ObserverChannelRow, filters: EventQueryFilters) {
  const sql = getSql();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const excludedGroups = filters.excludedGroups ?? [];
  const decodedFields = filters.decodedFields ?? DECODED_FIELDS.api;
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
      (
        select coalesce(
          jsonb_object_agg(decoded_key, e.decoded -> decoded_key) filter (where e.decoded ? decoded_key),
          '{}'::jsonb
        )
        from unnest(${decodedFields}::text[]) as decoded_key
      ) as decoded
    from observer_events e
    where e.chain_id = ${channel.chain_id}::bigint
      and e.channel_id = ${channel.channel_id}
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
  filters: EventQueryFilters & { limit: number; offset: number },
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
  decodedFields: readonly string[],
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
        (
          select coalesce(
            jsonb_object_agg(decoded_key, e.decoded -> decoded_key) filter (where e.decoded ? decoded_key),
            '{}'::jsonb
          )
          from unnest(${decodedFields}::text[]) as decoded_key
        ) as decoded
      from observer_events e
      where e.chain_id = ${channel.chain_id}::bigint
        and e.channel_id = ${channel.channel_id}
        and e.event_group = any(${eventGroups}::text[])
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

async function incidentRows(
  channel: ObserverChannelRow,
  filters: { activeOnly?: boolean; limit?: number },
) {
  const sql = getSql();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = await sql`
    select
      id::text,
      chain_id::text,
      channel_id,
      status,
      severity,
      title,
      body,
      reference_url,
      opened_at,
      resolved_at,
      created_at,
      updated_at
    from observer_incidents
    where chain_id = ${channel.chain_id}::bigint
      and channel_id = ${channel.channel_id}
      and (${filters.activeOnly ?? false}::boolean = false or status = 'active')
    order by opened_at desc, id desc
    limit ${String(limit)}::integer
  ` as ObserverIncidentRow[];
  return rows;
}

function pageFor(options: ObserverDashboardOptions, listName: ObserverEventListName): ObserverEventListPage {
  const page = options.eventListPages?.[listName] ?? { limit: eventListLimit(options), offset: 0 };
  return {
    limit: Math.min(page.limit, eventListLimit(options)),
    offset: page.offset,
  };
}

function selectedEventLists(options: ObserverDashboardOptions, listMode: ObserverDashboardOptions["listMode"]) {
  if (options.eventLists) {
    return new Set(options.eventLists);
  }
  return new Set<ObserverEventListName>(listMode === "all" ? Object.keys(EMPTY_LIST_TOTALS) as ObserverEventListName[] : []);
}

function samePage(left: ObserverEventListPage, right: ObserverEventListPage) {
  return left.limit === right.limit && left.offset === right.offset;
}

function eventListLimit(options: ObserverDashboardOptions) {
  return Math.min(Math.max(options.eventListLimit ?? 100, 1), 500);
}

function emptyEventLists(): ObserverDashboard["lists"] {
  return {
    bridgeEvents: [],
    participantJoinEvents: [],
    participantAddressPairEvents: [],
    participantPublicKeyEvents: [],
    participantExitEvents: [],
    commitmentEvents: [],
    nullifierEvents: [],
    encryptedPayloadEvents: [],
    privateStateEvents: [],
    policyEvents: [],
    transitionEvents: [],
    verifierEvents: [],
    adminEvents: [],
    upgradeEvents: [],
  };
}

function decodedFieldsForEventFilters(filters: { group?: string; event?: string }) {
  if (filters.event === "ChannelTokenVaultIdentityRegistered") {
    return DECODED_FIELDS.participantJoin;
  }
  if (filters.event === "ChannelTokenVaultIdentityExited") {
    return DECODED_FIELDS.participantExit;
  }
  if (filters.event === "StorageKeyObserved") {
    return DECODED_FIELDS.commitment;
  }
  if (filters.event === "NoteValueEncrypted") {
    return DECODED_FIELDS.encryptedPayload;
  }
  if (filters.event === "CurrentRootVectorObserved" || filters.group === "transition") {
    return DECODED_FIELDS.transition;
  }
  if (filters.group === "deposit" || filters.group === "withdrawal") {
    return DECODED_FIELDS.bridge;
  }
  if (filters.group === "policy") {
    return DECODED_FIELDS.policy;
  }
  if (filters.group === "verifier") {
    return DECODED_FIELDS.verifier;
  }
  if (filters.group === "admin") {
    return DECODED_FIELDS.admin;
  }
  if (filters.group === "upgrade") {
    return DECODED_FIELDS.upgrade;
  }
  return DECODED_FIELDS.api;
}
