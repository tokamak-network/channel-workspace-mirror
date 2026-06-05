import Link from "next/link";
import type { ReactNode } from "react";
import { PRIVATE_STATE_CLI_NPM_URL } from "@/lib/observer/npm-package";
import type { ObserverDashboard, ObserverEventRow, ObserverIncidentRow } from "@/lib/observer/queries";
import { CopyableValue } from "./copyable-value";

type SectionId = "channel" | "bridge" | "participants" | "events" | "upgrades" | "notices";
type ObserverSearchParams = Record<string, string | string[] | undefined>;
type ObserverChannel = ObserverDashboard["channel"];
type ExternalLinkItem = {
  label: string;
  value: string | null;
};

const TOKAMAK_DOCS_INDEX_URL = "https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/blob/main/docs/index.md";
type ObserverSectionDefinition = {
  id: SectionId;
  title: string;
  summary: string;
};

export const observerSections: ObserverSectionDefinition[] = [
  {
    id: "channel",
    title: "Channel Profile",
    summary: "Channel identity, contract addresses, policy snapshot, and published artifacts.",
  },
  {
    id: "bridge",
    title: "Bridge Status",
    summary: "Public L1 bridge totals, bridge contracts, and the transparent entry/exit boundary.",
  },
  {
    id: "participants",
    title: "Participants",
    summary: "Participant counts, registration surface, and public participant data scope.",
  },
  {
    id: "events",
    title: "Event Logs",
    summary: "Bridge, participant, private-state signal, and recent public event logs.",
  },
  {
    id: "upgrades",
    title: "Upgrade History",
    summary: "Current verification stack, upgrade surface, deployment metadata, and policy/verification/admin events.",
  },
  {
    id: "notices",
    title: "Notices",
    summary: "Incident notices, monitoring status, public data scope, and reference links.",
  },
];

export function isObserverSection(value: string): value is SectionId {
  return observerSections.some((section) => section.id === value);
}

export function ObserverOverview({ dashboard }: { dashboard: ObserverDashboard }) {
  const { channel, sync, stats } = dashboard;
  const hasDataIssue = sync.status === "issue";
  const unavailable = "Unavailable";
  const latestBlock = hasDataIssue ? unavailable : stats.latestAcceptedTransition?.block_number ?? "none";
  const totalEvents = hasDataIssue ? unavailable : displayedEventCount(stats.eventCounts);

  return (
    <main className="observer-shell">
      <ObserverHeader dashboard={dashboard} />
      <ObserverNav channelSlug={dashboard.channel.slug} />
      {hasDataIssue ? <DataIssueNotice message={sync.message} /> : null}

      <section className="overview-panel" aria-label="Channel overview">
        <div className="overview-primary">
          <p className="section-eyebrow">Snapshot</p>
          <h2>{channel.name}</h2>
          <p>
            Public status for users, operators, and dispute reviewers. Detailed evidence is separated by category.
          </p>
        </div>
        <dl className="summary-list">
          <InfoItem label="Sync height" value={hasDataIssue ? unavailable : sync.lastScannedBlock ?? "not synced"} />
          <InfoItem label="Latest L1 height" value={hasDataIssue ? unavailable : sync.latestBlock ?? "not synced"} />
          <InfoItem label="Last indexed" value={hasDataIssue ? unavailable : formatDate(sync.updatedAt)} />
          <InfoItem label="Latest transition" value={latestBlock} />
        </dl>
      </section>

      <section className="metric-grid" aria-label="Channel metrics">
        <Metric label="Bridge deposits (TON)" value={hasDataIssue ? unavailable : formatTokenAmount(stats.totalL1BridgeDeposits)} />
        <Metric label="Bridge withdrawals (TON)" value={hasDataIssue ? unavailable : formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        <Metric label="Active participants" value={hasDataIssue ? unavailable : stats.channelParticipantsCount} />
        <Metric label="Indexed events" value={totalEvents} />
      </section>

      <section className="overview-grid" aria-label="Key public records">
        <OverviewBlock title="Channel Profile" href={`/observer/${channel.slug}/channel`}>
          <InfoItem label="Channel ID" value={channel.channel_id} mono />
          <InfoItem label="DApp ID" value={channel.dapp_id} mono />
        </OverviewBlock>
        <OverviewBlock title="Bridge Status" href={`/observer/${channel.slug}/bridge`}>
          <InfoItem label="Deposits (TON)" value={hasDataIssue ? unavailable : formatTokenAmount(stats.totalL1BridgeDeposits)} />
          <InfoItem label="Withdrawals (TON)" value={hasDataIssue ? unavailable : formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        </OverviewBlock>
        <OverviewBlock title="Participants" href={`/observer/${channel.slug}/participants`}>
          <InfoItem label="Active" value={hasDataIssue ? unavailable : stats.channelParticipantsCount} />
          <InfoItem label="Joined" value={hasDataIssue ? unavailable : stats.joinedParticipantsCount} />
        </OverviewBlock>
        <OverviewBlock title="Event Logs" href={`/observer/${channel.slug}/events`}>
          <InfoItem label="Displayed events" value={hasDataIssue ? unavailable : displayedEventCount(stats.eventCounts)} />
          <InfoItem label="Event groups" value={hasDataIssue ? unavailable : displayedEventGroupCount(stats.eventCounts)} />
        </OverviewBlock>
        <OverviewBlock title="Upgrade History" href={`/observer/${channel.slug}/upgrades`}>
          <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
          <InfoItem label="Admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
        </OverviewBlock>
        <OverviewBlock title="Notices" href={`/observer/${channel.slug}/notices`}>
          <InfoItem label="Active incidents" value={activeIncidentLabel(dashboard.incidents.active.length)} />
          <InfoItem label="Last indexed" value={hasDataIssue ? unavailable : formatDate(sync.updatedAt)} />
        </OverviewBlock>
      </section>
    </main>
  );
}

export function ObserverSectionPage({
  dashboard,
  sectionId,
  searchParams = {},
  npmPackageVersion = null,
}: {
  dashboard: ObserverDashboard;
  sectionId: SectionId;
  searchParams?: ObserverSearchParams;
  npmPackageVersion?: string | null;
}) {
  const section = observerSections.find((item) => item.id === sectionId);
  if (!section) {
    return null;
  }

  return (
    <main className="observer-shell">
      <ObserverHeader dashboard={dashboard} />
      <ObserverNav channelSlug={dashboard.channel.slug} activeSection={sectionId} />
      <nav className="breadcrumb" aria-label="Observer navigation">
        <Link href={`/observer/${dashboard.channel.slug}`} prefetch={false}>Overview</Link>
        <span>{section.title}</span>
      </nav>
      <ObserverSection title={section.title} summary={section.summary}>
        <SectionDetail
          dashboard={dashboard}
          sectionId={sectionId}
          searchParams={searchParams}
          npmPackageVersion={npmPackageVersion ?? null}
        />
      </ObserverSection>
    </main>
  );
}

function ObserverHeader({
  dashboard,
}: {
  dashboard: ObserverDashboard;
}) {
  const { channel, sync } = dashboard;
  const hasDataIssue = sync.status === "issue";
  return (
    <header className="observer-header">
      <div>
        <p className="eyebrow">Public Channel Observer</p>
        <h1>{channel.name}</h1>
        <p className="lede">Public evidence for channel users, operators, and oversight reviewers.</p>
      </div>
      <dl className="status-strip" aria-label="Sync status">
        <InfoItem label="Scanned" value={hasDataIssue ? "Unavailable" : sync.lastScannedBlock ?? "not synced"} />
        <InfoItem label="Latest L1" value={hasDataIssue ? "Unavailable" : sync.latestBlock ?? "not synced"} />
        <InfoItem label="Updated" value={hasDataIssue ? "Unavailable" : formatDate(sync.updatedAt)} />
      </dl>
    </header>
  );
}

function ObserverNav({
  channelSlug,
  activeSection,
}: {
  channelSlug: string;
  activeSection?: SectionId;
}) {
  return (
    <nav className="observer-nav" aria-label="Observer sections">
      <Link className={!activeSection ? "active" : undefined} href={`/observer/${channelSlug}`} prefetch={false}>
        Overview
      </Link>
      {observerSections.map((section) => (
        <Link
          className={activeSection === section.id ? "active" : undefined}
          href={`/observer/${channelSlug}/${section.id}`}
          key={section.id}
          prefetch={false}
        >
          {section.title}
        </Link>
      ))}
    </nav>
  );
}

function SectionDetail({
  dashboard,
  sectionId,
  searchParams,
  npmPackageVersion,
}: {
  dashboard: ObserverDashboard;
  sectionId: SectionId;
  searchParams: ObserverSearchParams;
  npmPackageVersion: string | null;
}) {
  const { channel, stats, lists } = dashboard;
  const hasDataIssue = dashboard.sync.status === "issue";
  const verifierVersion = `Tokamak ${channel.tokamak_verifier_version ?? "unknown"} / Groth16 ${channel.groth_verifier_version ?? "unknown"}`;
  const eventPagePath = `/observer/${channel.slug}/events`;

  if (hasDataIssue && isObserverDataSection(sectionId)) {
    return <DataIssueNotice message={dashboard.sync.message} />;
  }

  if (sectionId === "channel") {
    return (
      <>
        <DetailSection title="Channel Profile">
          <InfoGrid>
            <InfoItem label="Channel name" value={channel.name} />
            <InfoItem label="Channel ID" value={channel.channel_id} mono />
            <InfoItem label="Chain ID" value={channel.chain_id} mono />
            <InfoItem label="DApp ID" value={channel.dapp_id} mono />
            <InfoItem label="DApp label" value="private-state DApp" />
            <InfoItem label="Channel registration tx" value={channel.channel_registration_tx ?? "not configured"} mono />
            <InfoItem label="Creator / leader" value={channel.leader ?? "unknown"} mono />
            <InfoItem label="Deployment block" value={channel.genesis_block} mono />
            <InfoItem label="Current state refreshed" value={formatDate(channel.current_state_refreshed_at)} />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Contract Addresses">
          <InfoGrid>
            <InfoItem label="Canonical TON" value={channel.canonical_asset ?? "unknown"} mono />
            <InfoItem label="BridgeCore" value={channel.bridge_core} mono />
            <InfoItem label="BridgeTokenVault" value={channel.bridge_token_vault} mono />
            <InfoItem label="ChannelManager" value={channel.channel_manager} mono />
            <InfoItem label="DAppManager" value={channel.dapp_manager ?? "unknown"} mono />
            <InfoItem label="ChannelDeployer" value={channel.channel_deployer ?? "unknown"} mono />
            <InfoItem label="Controller" value={channel.controller ?? "unknown"} mono />
            <InfoItem label="L2AccountingVault" value={channel.l2_accounting_vault ?? "unknown"} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Policy Snapshot">
          <InfoGrid>
            <InfoItem label="Channel policy hash" value={channel.function_root ?? "unknown"} mono />
            <InfoItem label="Accepted function root" value={channel.function_root ?? "unknown"} mono />
            <InfoItem label="DApp metadata hash" value={channel.dapp_metadata_digest ?? "unknown"} mono />
            <InfoItem label="DApp metadata schema" value={channel.dapp_metadata_digest_schema ?? "unknown"} mono />
            <InfoItem label="Current root vector hash" value={channel.current_root_vector_hash ?? "unknown"} mono />
            <InfoItem label="Current join toll (TON)" value={formatTokenAmount(channel.current_join_toll ?? "0")} />
            <InfoItem label="Toll refund policy" value={<TollRefundPolicy channel={channel} />} wide />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Source & Artifacts">
          <InfoGrid>
            <InfoItem label="Deployment Artifacts & Commits" value={<ExternalLinks links={deploymentArtifactLinks(channel)} />} />
            <InfoItem label="Source verification & Bytecode hash" value={<ExternalLinks links={sourceAndBytecodeLinks(channel)} />} />
            <InfoItem label="NPM package version" value={<NpmPackageVersion version={npmPackageVersion} />} />
          </InfoGrid>
        </DetailSection>
      </>
    );
  }

  if (sectionId === "bridge") {
    return (
      <>
        <DetailSection title="Bridge Summary">
          <InfoGrid>
            <InfoItem label="Total L1 bridge deposits (TON)" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
            <InfoItem label="Total L1 bridge withdrawals (TON)" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
            <InfoItem label="Net bridged amount (TON)" value={formatTokenAmount(subtractTokenAmounts(stats.totalL1BridgeDeposits, stats.totalL1BridgeWithdrawals))} />
            <InfoItem label="BridgeCore" value={channel.bridge_core} mono />
            <InfoItem label="BridgeTokenVault" value={channel.bridge_token_vault} mono />
            <InfoItem label="Canonical TON" value={channel.canonical_asset ?? "unknown"} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Public Edge Meaning">
          <p className="section-note">
            L1 bridge deposits and withdrawals are public L1 events. The observer shows the transparent bridge edge, but it does not reconstruct internal note provenance.
          </p>
        </DetailSection>
        <DetailSection title="Event Log Link">
          <p className="section-note">
            Deposit, withdrawal, join toll, and exit refund events are listed under <Link href={`/observer/${channel.slug}/events`} prefetch={false}>Event Logs</Link>.
          </p>
        </DetailSection>
      </>
    );
  }

  if (sectionId === "participants") {
    return (
      <>
        <DetailSection title="Participant Summary">
          <InfoGrid>
            <InfoItem label="Active participants" value={stats.channelParticipantsCount} />
            <InfoItem label="Joined participants" value={stats.joinedParticipantsCount} />
            <InfoItem label="Exited participants" value={stats.exitedParticipantsCount} />
            <InfoItem label="Burnt toll (TON)" value={formatTokenAmount(stats.realizedBurntToll)} />
            <InfoItem label="Channel ID" value={channel.channel_id} mono />
            <InfoItem label="DApp ID" value={channel.dapp_id} mono />
            <InfoItem label="Leader" value={channel.leader ?? "unknown"} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Registration Surface">
          <p className="section-note">
            Channel membership, L1/L2 address-pair registration, and note-receive public keys are publicly observable registration surfaces.
          </p>
        </DetailSection>
        <DetailSection title="Public Data Scope">
          <p className="section-note">
            Public records show participation and registered public keys. They do not reveal internal note transfer counterparties or note provenance.
          </p>
        </DetailSection>
        <DetailSection title="Event Log Link">
          <p className="section-note">
            Join, exit, address-pair, and note-receive public key records are listed under <Link href={`/observer/${channel.slug}/events`} prefetch={false}>Event Logs</Link>.
          </p>
        </DetailSection>
      </>
    );
  }

  if (sectionId === "events") {
    const eventCountSections = [
      {
        id: "bridge-event-list",
        title: "Bridge deposits, withdrawals, tolls, and refunds (TON amounts)",
        count: dashboard.listTotals.bridgeEvents,
      },
      {
        id: "participant-join-event-list",
        title: "Channel joins",
        count: dashboard.listTotals.participantJoinEvents,
      },
      {
        id: "participant-address-pair-event-list",
        title: "Registered L1 / L2 address pairs",
        count: dashboard.listTotals.participantAddressPairEvents,
      },
      {
        id: "participant-public-key-event-list",
        title: "Note-receive public keys",
        count: dashboard.listTotals.participantPublicKeyEvents,
      },
      {
        id: "participant-exit-event-list",
        title: "Channel exits",
        count: dashboard.listTotals.participantExitEvents,
      },
      {
        id: "transition-accounting-event-list",
        title: "Accepted transitions and storage/accounting signals",
        count: dashboard.listTotals.privateStateEvents,
      },
      {
        id: "commitment-event-list",
        title: "Commitments and nullifiers",
        count: dashboard.listTotals.commitmentEvents,
      },
      {
        id: "encrypted-payload-event-list",
        title: "Encrypted payloads",
        count: dashboard.listTotals.encryptedPayloadEvents,
      },
    ];
    return (
      <>
        <DetailSection id="event-counts" title="Event Counts">
          <EventCountSummary items={eventCountSections} />
        </DetailSection>
        <DetailSection id="bridge-events" title="Bridge Events">
          <EventTable
            id="bridge-event-list"
            title="Bridge deposits, withdrawals, tolls, and refunds (TON amounts)"
            events={lists.bridgeEvents}
            displayLimit={15}
            totalCount={dashboard.listTotals.bridgeEvents}
            pageParam="bridgePage"
            searchParams={searchParams}
            basePath={eventPagePath}
          />
        </DetailSection>
        <DetailSection id="participant-events" title="Participant Events">
          <EventTable
            id="participant-join-event-list"
            title="Channel joins"
            events={lists.participantJoinEvents}
            displayLimit={10}
            totalCount={dashboard.listTotals.participantJoinEvents}
            pageParam="joinsPage"
            decodedFields={["joinedAt", "leafIndex", "joinTollPaid"]}
            searchParams={searchParams}
            basePath={eventPagePath}
          />
          <EventTable
            id="participant-address-pair-event-list"
            title="Registered L1 / L2 address pairs"
            events={lists.participantAddressPairEvents}
            displayLimit={10}
            totalCount={dashboard.listTotals.participantAddressPairEvents}
            pageParam="addressPairsPage"
            decodedFields={["l1Address", "l2Address", "channelTokenVaultKey"]}
            searchParams={searchParams}
            basePath={eventPagePath}
          />
          <EventTable
            id="participant-public-key-event-list"
            title="Note-receive public keys"
            events={lists.participantPublicKeyEvents}
            displayLimit={10}
            totalCount={dashboard.listTotals.participantPublicKeyEvents}
            pageParam="publicKeysPage"
            decodedFields={["l1Address", "noteReceivePubKeyX", "noteReceivePubKeyYParity"]}
            searchParams={searchParams}
            basePath={eventPagePath}
          />
          <EventTable
            id="participant-exit-event-list"
            title="Channel exits"
            events={lists.participantExitEvents}
            displayLimit={10}
            totalCount={dashboard.listTotals.participantExitEvents}
            pageParam="exitsPage"
            decodedFields={["l1Address", "leafIndex"]}
            searchParams={searchParams}
            basePath={eventPagePath}
          />
        </DetailSection>
        <DetailSection id="private-state-events" title="Private-State Public Signal Events">
          <EventTable
            id="transition-accounting-event-list"
            title="Accepted transitions and storage/accounting signals"
            events={lists.privateStateEvents}
            displayLimit={15}
            totalCount={dashboard.listTotals.privateStateEvents}
            pageParam="privateStatePage"
            searchParams={searchParams}
            basePath={eventPagePath}
          />
          <EventTable
            id="commitment-event-list"
            title="Commitments and nullifiers"
            events={lists.commitmentEvents}
            displayLimit={15}
            totalCount={dashboard.listTotals.commitmentEvents}
            pageParam="commitmentsPage"
            searchParams={searchParams}
            basePath={eventPagePath}
          />
          <EventTable
            id="encrypted-payload-event-list"
            title="Encrypted payloads"
            events={lists.encryptedPayloadEvents}
            displayLimit={15}
            totalCount={dashboard.listTotals.encryptedPayloadEvents}
            pageParam="encryptedPayloadsPage"
            searchParams={searchParams}
            basePath={eventPagePath}
          />
        </DetailSection>
      </>
    );
  }

  if (sectionId === "upgrades") {
    return (
      <>
        <DetailSection title="Current Verification Stack">
          <InfoGrid>
            <InfoItem label="Verifier version" value={verifierVersion} />
            <InfoItem label="Groth16 verifier" value={channel.groth_verifier ?? "unknown"} mono />
            <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
            <InfoItem label="Latest accepted transition" value={stats.latestAcceptedTransition?.block_number ?? "none"} />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Current Upgrade Surface">
          <InfoGrid>
            <InfoItem label="BridgeCore proxy" value={channel.bridge_core} mono />
            <InfoItem label="BridgeCore implementation" value={channel.bridge_core_implementation ?? "not indexed"} mono />
            <InfoItem label="BridgeTokenVault proxy" value={channel.bridge_token_vault} mono />
            <InfoItem label="BridgeTokenVault implementation" value={channel.bridge_token_vault_implementation ?? "not indexed"} mono />
            <InfoItem label="Owner / admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
            <InfoItem label="Channel leader" value={channel.leader ?? "unknown"} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Deployment Metadata">
          <InfoGrid>
            <InfoItem label="Deployment block" value={channel.genesis_block} mono />
            <InfoItem label="Current state refreshed" value={formatDate(channel.current_state_refreshed_at)} />
            <InfoItem label="Deployment Artifacts & Commits" value={<ExternalLinks links={deploymentArtifactLinks(channel)} />} />
            <InfoItem label="NPM package version" value={<NpmPackageVersion version={npmPackageVersion} />} />
            <InfoItem label="Source verification & Bytecode hash" value={<ExternalLinks links={sourceAndBytecodeLinks(channel)} />} />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Policy Events">
          <EventTable title="Policy and metadata changes" events={lists.policyEvents} displayLimit={50} />
        </DetailSection>
        <DetailSection title="Verification Events">
          <EventTable title="Verifier updates" events={lists.verifierEvents} displayLimit={50} />
        </DetailSection>
        <DetailSection title="Admin / Upgrade Events">
          <EventTable title="Proxy upgrades and implementation changes" events={lists.upgradeEvents} displayLimit={50} />
          <EventTable title="Ownership and admin records" events={lists.adminEvents} displayLimit={50} />
        </DetailSection>
      </>
    );
  }

  return (
    <>
      <DetailSection title="Current Notices">
        <IncidentList incidents={dashboard.incidents.active} emptyText="No active incident notices" />
      </DetailSection>
      <DetailSection title="Incident History">
        <IncidentList incidents={dashboard.incidents.history} emptyText="No incident history" />
      </DetailSection>
      <DetailSection title="Monitoring Status">
        <InfoGrid>
          <InfoItem label="Last observer sync" value={hasDataIssue ? "Unavailable" : formatDate(dashboard.sync.updatedAt)} />
          <InfoItem label="Latest scanned block" value={hasDataIssue ? "Unavailable" : dashboard.sync.lastScannedBlock ?? "not synced"} />
          <InfoItem label="Latest L1 block" value={hasDataIssue ? "Unavailable" : dashboard.sync.latestBlock ?? "not synced"} />
        </InfoGrid>
      </DetailSection>
      <DetailSection title="Public Data Scope">
        <p className="section-note">
          The observer shows L1 bridge edges, channel registration, accepted transitions, commitments, nullifiers, encrypted note events, verifier information, and channel policy. It does not deanonymize private note transfers or reconstruct internal note provenance.
        </p>
      </DetailSection>
      <DetailSection title="Reference Links">
        <InfoGrid>
          <InfoItem label="Deployment Artifacts & Commits" value={<ExternalLinks links={deploymentArtifactLinks(channel)} />} />
          <InfoItem label="Explorer links" value={<ExternalLinks links={explorerLinks(channel)} />} />
          <InfoItem label="Monitoring packet / policy docs" value={<ExternalLinks links={monitoringPolicyLinks()} />} />
        </InfoGrid>
      </DetailSection>
    </>
  );
}

function ObserverSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="observer-section">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function DetailSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="detail-section" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function OverviewBlock({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className="overview-block">
      <div className="overview-block-heading">
        <h2>{title}</h2>
        <Link href={href} prefetch={false}>Details</Link>
      </div>
      <dl className="summary-list">{children}</dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataIssueNotice({ message }: { message?: string | null }) {
  return (
    <section className="data-issue-notice" role="status">
      <p>{message ?? "Observer data is currently unavailable."}</p>
    </section>
  );
}

function EventCountSummary({
  items,
}: {
  items: Array<{ id: string; title: string; count: string }>;
}) {
  return (
    <nav className="event-count-summary" aria-label="Event count section links">
      {items.map((item) => (
        <a href={`#${item.id}`} key={item.id}>
          <span>{item.title}</span>
          <strong>{item.count}</strong>
        </a>
      ))}
    </nav>
  );
}

function IncidentList({
  incidents,
  emptyText,
}: {
  incidents: ObserverIncidentRow[];
  emptyText: string;
}) {
  if (incidents.length === 0) {
    return <p className="section-note">{emptyText}</p>;
  }
  return (
    <div className="incident-list">
      {incidents.map((incident) => (
        <article className="incident-item" key={incident.id}>
          <div className="incident-heading">
            <span className={`incident-severity severity-${incident.severity}`}>{incident.severity}</span>
            <span className={`incident-status status-${incident.status}`}>{incident.status}</span>
          </div>
          <h4>{incident.title}</h4>
          <p>{incident.body}</p>
          <dl className="incident-meta">
            <InfoItem label="Opened" value={formatDate(incident.opened_at)} />
            <InfoItem label="Resolved" value={incident.resolved_at ? formatDate(incident.resolved_at) : "not resolved"} />
            {incident.reference_url ? (
              <InfoItem
                label="Reference"
                value={
                  <a href={incident.reference_url} rel="noreferrer" target="_blank">
                    {incident.reference_url}
                  </a>
                }
              />
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="info-grid">{children}</dl>;
}

function InfoItem({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "info-item info-item-wide" : "info-item"}>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

function TollRefundPolicy({ channel }: { channel: ObserverChannel }) {
  const schedule = tollRefundSchedule(channel);
  if (!schedule) {
    return "not indexed";
  }
  if (schedule === "invalid") {
    return "invalid policy snapshot";
  }
  return (
    <table className="toll-policy-table">
      <thead>
        <tr>
          <th>Exit timing</th>
          <th>Refunded</th>
          <th>Burnt</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((item) => (
          <tr key={item.label}>
            <td>{item.label}</td>
            <td>{formatBpsPercent(item.refundBps)}</td>
            <td>{formatBpsPercent(10000n - item.refundBps)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventTable({
  id,
  title,
  events,
  displayLimit,
  totalCount,
  pageParam,
  searchParams,
  basePath,
  decodedFields,
}: {
  id?: string;
  title: string;
  events: ObserverEventRow[];
  displayLimit: number;
  totalCount?: string;
  pageParam?: string;
  searchParams?: ObserverSearchParams;
  basePath?: string;
  decodedFields?: string[];
}) {
  const eventCount = Number.parseInt(totalCount ?? String(events.length), 10);
  const requestedPage = pageParam ? parsePageNumber(searchParams?.[pageParam]) : 1;
  const totalPages = Math.max(Math.ceil(eventCount / displayLimit), 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * displayLimit;
  const visibleEvents = pageParam ? events : events.slice(startIndex, startIndex + displayLimit);
  const endIndex = startIndex + visibleEvents.length;
  const rangeText = visibleEvents.length === 0 ? "0" : `${startIndex + 1}-${endIndex}`;
  return (
    <section className="event-block" id={id}>
      <div className="event-heading">
        <h3>{title}</h3>
        <span>{visibleEvents.length === eventCount ? eventCount : `${rangeText} of ${eventCount}`}</span>
      </div>
      <div className="table-wrap">
        <table className="event-table">
          <colgroup>
            <col className="event-table-block" />
            <col className="event-table-name" />
            <col className="event-table-transaction" />
            <col className="event-table-fields" />
          </colgroup>
          <thead>
            <tr>
              <th>Block</th>
              <th>Event</th>
              <th>Transaction</th>
              <th>Decoded fields</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.length === 0 ? (
              <tr>
                <td colSpan={4}>No indexed events</td>
              </tr>
            ) : (
              visibleEvents.map((event) => (
                <tr key={`${event.transaction_hash}-${event.log_index}`}>
                  <td>{event.block_number}</td>
                  <td>
                    <span className="event-name">{event.event_name}</span>
                    <span className="event-group">{eventGroupLabel(event.event_group)}</span>
                  </td>
                  <td className="mono">
                    <CopyableValue
                      displayValue={shortHash(event.transaction_hash)}
                      value={event.transaction_hash}
                    />
                  </td>
                  <td>
                    <DecodedFields fields={decodedFields} value={event.decoded} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageParam && basePath && totalPages > 1 ? (
        <nav className="event-pagination" aria-label={`${title} pagination`}>
          {currentPage > 1 ? (
            <Link href={pageHref(basePath, searchParams ?? {}, pageParam, currentPage - 1)} prefetch={false}>Previous {displayLimit}</Link>
          ) : (
            <span aria-disabled="true">Previous {displayLimit}</span>
          )}
          <span>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Link href={pageHref(basePath, searchParams ?? {}, pageParam, currentPage + 1)} prefetch={false}>Next {displayLimit}</Link>
          ) : (
            <span aria-disabled="true">Next {displayLimit}</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}

function DecodedFields({ fields, value }: { fields?: string[]; value: Record<string, unknown> }) {
  const entries = fields
    ? fields.map((field) => [field, value[field]] as const)
    : Object.entries(value).slice(0, 8);
  if (entries.length === 0) {
    return <span className="muted">empty</span>;
  }
  return (
    <dl className="decoded-fields">
      {entries.map(([key, field]) => (
        <div key={key}>
          <dt>{decodedFieldLabel(key)}</dt>
          <dd>{formatDecodedValue(key, field)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExternalLinks({ links }: { links: ExternalLinkItem[] }) {
  const availableLinks = links.filter((link): link is { label: string; value: string } => Boolean(link.value));
  if (availableLinks.length === 0) {
    return "unavailable";
  }
  return (
    <span className="external-link-list">
      {availableLinks.map((link) => (
        <a href={link.value} key={`${link.label}-${link.value}`} rel="noreferrer" target="_blank">
          {link.label}
        </a>
      ))}
    </span>
  );
}

function NpmPackageVersion({ version }: { version: string | null }) {
  return (
    <a href={PRIVATE_STATE_CLI_NPM_URL} rel="noreferrer" target="_blank">
      @tokamak-private-dapps/private-state-cli {version ?? "latest unavailable"}
    </a>
  );
}

function sourceAndBytecodeLinks(channel: ObserverChannel): ExternalLinkItem[] {
  return contractCodeLinks(channel).map((link) => ({
    label: link.label,
    value: link.value,
  }));
}

function explorerLinks(channel: ObserverChannel): ExternalLinkItem[] {
  return [
    ...contractAddressLinks(channel),
    {
      label: "Channel registration tx",
      value: etherscanTxUrl(channel, channel.channel_registration_tx),
    },
  ];
}

function deploymentArtifactLinks(channel: ObserverChannel): ExternalLinkItem[] {
  return [
    {
      label: "Deployment source",
      value: channel.source_code_url,
    },
    {
      label: "ABI / deployment artifacts",
      value: channel.abi_url,
    },
    {
      label: "bridge.1.json",
      value: channel.abi_url,
    },
    {
      label: "deployment.1.latest.json",
      value: channel.abi_url,
    },
  ];
}

function monitoringPolicyLinks(): ExternalLinkItem[] {
  return [
    {
      label: "Official docs index",
      value: TOKAMAK_DOCS_INDEX_URL,
    },
  ];
}

function contractCodeLinks(channel: ObserverChannel): ExternalLinkItem[] {
  return contractAddressLinks(channel).map((link) => ({
    label: link.label,
    value: link.value ? `${link.value}#code` : null,
  }));
}

function contractAddressLinks(channel: ObserverChannel): ExternalLinkItem[] {
  return [
    {
      label: "BridgeCore",
      value: etherscanAddressUrl(channel, channel.bridge_core),
    },
    {
      label: "BridgeTokenVault",
      value: etherscanAddressUrl(channel, channel.bridge_token_vault),
    },
    {
      label: "ChannelManager",
      value: etherscanAddressUrl(channel, channel.channel_manager),
    },
    {
      label: "DAppManager",
      value: etherscanAddressUrl(channel, channel.dapp_manager),
    },
    {
      label: "Controller",
      value: etherscanAddressUrl(channel, channel.controller),
    },
    {
      label: "L2AccountingVault",
      value: etherscanAddressUrl(channel, channel.l2_accounting_vault),
    },
    {
      label: "Groth16 verifier",
      value: etherscanAddressUrl(channel, channel.groth_verifier),
    },
    {
      label: "Tokamak verifier",
      value: etherscanAddressUrl(channel, channel.tokamak_verifier),
    },
  ];
}

function etherscanAddressUrl(channel: ObserverChannel, address: string | null) {
  if (!address) {
    return null;
  }
  return `${etherscanBaseUrl(channel)}/address/${address}`;
}

function etherscanTxUrl(channel: ObserverChannel, txHash: string | null) {
  if (!txHash) {
    return null;
  }
  return `${etherscanBaseUrl(channel)}/tx/${txHash}`;
}

function etherscanBaseUrl(channel: ObserverChannel) {
  return channel.chain_id === "11155111" ? "https://sepolia.etherscan.io" : "https://etherscan.io";
}

function formatDate(value: string | null) {
  if (!value) {
    return "not synced";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTokenAmount(value: string) {
  const wei = BigInt(value.split(".")[0] || "0");
  const sign = wei < 0n ? "-" : "";
  const absoluteWei = wei < 0n ? -wei : wei;
  const whole = absoluteWei / 10n ** 18n;
  const fraction = absoluteWei % 10n ** 18n;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return fractionText ? `${sign}${whole}.${fractionText}` : `${sign}${whole}`;
}

function tollRefundSchedule(channel: ObserverChannel) {
  const cutoff1 = parseOptionalUnsignedInteger(channel.toll_refund_cutoff1_seconds);
  const cutoff2 = parseOptionalUnsignedInteger(channel.toll_refund_cutoff2_seconds);
  const cutoff3 = parseOptionalUnsignedInteger(channel.toll_refund_cutoff3_seconds);
  const bps1 = parseOptionalUnsignedInteger(channel.toll_refund_bps1);
  const bps2 = parseOptionalUnsignedInteger(channel.toll_refund_bps2);
  const bps3 = parseOptionalUnsignedInteger(channel.toll_refund_bps3);
  const bps4 = parseOptionalUnsignedInteger(channel.toll_refund_bps4);
  if (
    cutoff1 == null
    || cutoff2 == null
    || cutoff3 == null
    || bps1 == null
    || bps2 == null
    || bps3 == null
    || bps4 == null
  ) {
    return null;
  }
  if (cutoff1 > cutoff2 || cutoff2 > cutoff3 || bps1 > 10000n || bps2 > 10000n || bps3 > 10000n || bps4 > 10000n) {
    return "invalid" as const;
  }
  return [
    { label: `0-${formatDurationShort(cutoff1)}`, refundBps: bps1 },
    { label: `${formatDurationShort(cutoff1)}-${formatDurationShort(cutoff2)}`, refundBps: bps2 },
    { label: `${formatDurationShort(cutoff2)}-${formatDurationShort(cutoff3)}`, refundBps: bps3 },
    { label: `After ${formatDurationShort(cutoff3)}`, refundBps: bps4 },
  ];
}

function parseOptionalUnsignedInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
}

function formatDurationShort(value: bigint) {
  const units = [
    { label: "d", seconds: 86400n },
    { label: "h", seconds: 3600n },
    { label: "m", seconds: 60n },
  ] as const;
  for (const unit of units) {
    if (value !== 0n && value % unit.seconds === 0n) {
      return `${(value / unit.seconds).toString()}${unit.label}`;
    }
  }
  return `${value.toString()}s`;
}

function formatBpsPercent(value: bigint) {
  const whole = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n ? `${whole.toString()}%` : `${whole.toString()}.${fraction.toString().padStart(2, "0").replace(/0+$/, "")}%`;
}

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function eventGroupLabel(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function isUpgradeEventGroup(value: string) {
  return value === "policy" || value === "verifier" || value === "admin" || value === "upgrade";
}

function isEventLogGroup(value: string) {
  return !isUpgradeEventGroup(value) && value !== "mirror" && value !== "channel_registration";
}

function subtractTokenAmounts(left: string, right: string) {
  return (BigInt(left.split(".")[0] || "0") - BigInt(right.split(".")[0] || "0")).toString();
}

const TOKEN_AMOUNT_FIELDS = new Set(["amount", "joinTollPaid"]);

function decodedFieldLabel(key: string) {
  return TOKEN_AMOUNT_FIELDS.has(key) ? `${key} (TON)` : key;
}

function formatDecodedValue(key: string, value: unknown): ReactNode {
  if (TOKEN_AMOUNT_FIELDS.has(key)) {
    return formatTokenAmount(String(value ?? "0"));
  }
  if (typeof value === "string") {
    return <CopyableValue displayValue={shortHash(value)} value={value} />;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value == null) {
    return "null";
  }
  const json = JSON.stringify(value);
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

function isObserverDataSection(sectionId: SectionId) {
  return sectionId === "bridge" || sectionId === "participants" || sectionId === "events" || sectionId === "upgrades";
}

function activeIncidentLabel(count: number) {
  return count === 0 ? "No active incident notices" : `${count} active incident${count === 1 ? "" : "s"}`;
}

function displayedEventCount(counts: Record<string, string>) {
  return Object.entries(counts)
    .filter(([group]) => isEventLogGroup(group))
    .map(([, count]) => count)
    .reduce((total, value) => total + BigInt(value), 0n)
    .toString();
}

function displayedEventGroupCount(counts: Record<string, string>) {
  return String(Object.keys(counts).filter(isEventLogGroup).length);
}

function parsePageNumber(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function pageHref(
  basePath: string,
  searchParams: ObserverSearchParams,
  pageParam: string,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || key === pageParam) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      params.append(key, item);
    }
  }
  if (page > 1) {
    params.set(pageParam, String(page));
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
