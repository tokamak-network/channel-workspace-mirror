import Link from "next/link";
import type { ReactNode } from "react";
import type { ObserverDashboard, ObserverEventRow } from "@/lib/observer/queries";

type SectionId = "channel" | "bridge" | "participants" | "events" | "upgrades" | "notices";

type ObserverSectionDefinition = {
  id: SectionId;
  title: string;
  summary: string;
};

export const observerSections: ObserverSectionDefinition[] = [
  {
    id: "channel",
    title: "채널 고정 정보",
    summary: "Channel identity, contract addresses, policy snapshot, and published artifacts.",
  },
  {
    id: "bridge",
    title: "브릿지 현황",
    summary: "Public L1 bridge totals, bridge contracts, and the transparent entry/exit boundary.",
  },
  {
    id: "participants",
    title: "참여자들",
    summary: "Participant counts, registration surface, and public participant data scope.",
  },
  {
    id: "events",
    title: "이벤트 로그들",
    summary: "Bridge, participant, private-state signal, and recent public event logs.",
  },
  {
    id: "upgrades",
    title: "업그레이드 히스토리",
    summary: "Current verification stack, upgrade surface, deployment metadata, and policy/verification/admin events.",
  },
  {
    id: "notices",
    title: "공지사항",
    summary: "Incident notices, monitoring status, public data scope, and reference links.",
  },
];

export function isObserverSection(value: string): value is SectionId {
  return observerSections.some((section) => section.id === value);
}

export function ObserverOverview({ dashboard }: { dashboard: ObserverDashboard }) {
  const { channel, sync, stats, lists } = dashboard;
  const latestBlock = stats.latestAcceptedTransition?.block_number ?? "none";
  const totalEvents = sumEventCounts(stats.eventCounts);

  return (
    <main className="observer-shell">
      <ObserverHeader dashboard={dashboard} />
      <ObserverNav channelSlug={dashboard.channel.slug} />

      <section className="overview-panel" aria-label="Channel overview">
        <div className="overview-primary">
          <p className="section-eyebrow">Snapshot</p>
          <h2>{channel.name}</h2>
          <p>
            Public status for users, operators, and dispute reviewers. Detailed evidence is separated by category.
          </p>
        </div>
        <dl className="summary-list">
          <InfoItem label="Sync height" value={sync.lastScannedBlock ?? "not synced"} />
          <InfoItem label="Latest L1 height" value={sync.latestBlock ?? "not synced"} />
          <InfoItem label="Last indexed" value={formatDate(sync.updatedAt)} />
          <InfoItem label="Latest transition" value={latestBlock} />
        </dl>
      </section>

      <section className="metric-grid" aria-label="Channel metrics">
        <Metric label="Bridge deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
        <Metric label="Bridge withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        <Metric label="Active participants" value={stats.channelParticipantsCount} />
        <Metric label="Indexed events" value={totalEvents} />
      </section>

      <section className="overview-grid" aria-label="Key public records">
        <OverviewBlock title="채널 고정 정보" href={`/observer/${channel.slug}/channel`}>
          <InfoItem label="Channel ID" value={channel.channel_id} mono />
          <InfoItem label="DApp ID" value={channel.dapp_id} mono />
        </OverviewBlock>
        <OverviewBlock title="브릿지 현황" href={`/observer/${channel.slug}/bridge`}>
          <InfoItem label="Deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
          <InfoItem label="Withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        </OverviewBlock>
        <OverviewBlock title="참여자들" href={`/observer/${channel.slug}/participants`}>
          <InfoItem label="Active" value={stats.channelParticipantsCount} />
          <InfoItem label="Joined" value={stats.joinedParticipantsCount} />
        </OverviewBlock>
        <OverviewBlock title="이벤트 로그들" href={`/observer/${channel.slug}/events`}>
          <InfoItem label="Indexed events" value={sumEventCounts(stats.eventCounts)} />
          <InfoItem label="Recent public records" value={String(lists.recentEvents.length)} />
        </OverviewBlock>
        <OverviewBlock title="업그레이드 히스토리" href={`/observer/${channel.slug}/upgrades`}>
          <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
          <InfoItem label="Admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
        </OverviewBlock>
        <OverviewBlock title="공지사항" href={`/observer/${channel.slug}/notices`}>
          <InfoItem label="Incident status" value={channel.incident_notice ?? "No active incident notices"} />
          <InfoItem label="Last indexed" value={formatDate(sync.updatedAt)} />
        </OverviewBlock>
      </section>
    </main>
  );
}

export function ObserverSectionPage({
  dashboard,
  sectionId,
}: {
  dashboard: ObserverDashboard;
  sectionId: SectionId;
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
        <Link href={`/observer/${dashboard.channel.slug}`}>메인</Link>
        <span>{section.title}</span>
      </nav>
      <ObserverSection title={section.title} summary={section.summary}>
        <SectionDetail dashboard={dashboard} sectionId={sectionId} />
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
  return (
    <header className="observer-header">
      <div>
        <p className="eyebrow">Public Channel Observer</p>
        <h1>{channel.name}</h1>
        <p className="lede">Public evidence for channel users, operators, and oversight reviewers.</p>
      </div>
      <dl className="status-strip" aria-label="Sync status">
        <InfoItem label="Scanned" value={sync.lastScannedBlock ?? "not synced"} />
        <InfoItem label="Latest L1" value={sync.latestBlock ?? "not synced"} />
        <InfoItem label="Updated" value={formatDate(sync.updatedAt)} />
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
      <Link className={!activeSection ? "active" : undefined} href={`/observer/${channelSlug}`}>
        메인
      </Link>
      {observerSections.map((section) => (
        <Link
          className={activeSection === section.id ? "active" : undefined}
          href={`/observer/${channelSlug}/${section.id}`}
          key={section.id}
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
}: {
  dashboard: ObserverDashboard;
  sectionId: SectionId;
}) {
  const { channel, stats, lists } = dashboard;
  const verifierVersion = `Tokamak ${channel.tokamak_verifier_version ?? "unknown"} / Groth16 ${channel.groth_verifier_version ?? "unknown"}`;

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
            <InfoItem label="Creation tx" value={stats.channelCreated?.transaction_hash ?? "not indexed"} mono />
            <InfoItem label="Creator / leader" value={channel.leader ?? "unknown"} mono />
            <InfoItem label="Deployment block" value={channel.genesis_block} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Contract Addresses">
          <InfoGrid>
            <InfoItem label="Canonical TON" value={channel.canonical_asset ?? "unknown"} mono />
            <InfoItem label="BridgeCore" value={channel.bridge_core} mono />
            <InfoItem label="BridgeTokenVault" value={channel.bridge_token_vault} mono />
            <InfoItem label="ChannelManager" value={channel.channel_manager} mono />
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
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Source & Artifacts">
          <InfoGrid>
            <InfoItem label="Source code" value={<ExternalValue value={channel.source_code_url} />} />
            <InfoItem label="ABI" value={<ExternalValue value={channel.abi_url} />} />
            <InfoItem label="Source verification" value="not indexed" />
            <InfoItem label="Bytecode hash" value="not indexed" />
            <InfoItem label="Deployed Git commit" value="not indexed" />
            <InfoItem label="NPM package version" value="not indexed" />
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
            <InfoItem label="Total L1 bridge deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
            <InfoItem label="Total L1 bridge withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
            <InfoItem label="Net bridged amount" value={formatTokenAmount(subtractTokenAmounts(stats.totalL1BridgeDeposits, stats.totalL1BridgeWithdrawals))} />
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
            Deposit, withdrawal, join toll, and exit refund events are listed under <Link href={`/observer/${channel.slug}/events`}>이벤트 로그들</Link>.
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
            Join, exit, address-pair, and note-receive public key records are listed under <Link href={`/observer/${channel.slug}/events`}>이벤트 로그들</Link>.
          </p>
        </DetailSection>
      </>
    );
  }

  if (sectionId === "events") {
    const eventCounts = Object.entries(stats.eventCounts).filter(([group]) => !isUpgradeEventGroup(group));
    return (
      <>
        <DetailSection title="Event Counts">
          <section className="metric-grid compact" aria-label="Event counts">
            {eventCounts.map(([group, count]) => (
              <Metric key={group} label={eventGroupLabel(group)} value={count} />
            ))}
          </section>
        </DetailSection>
        <DetailSection title="Bridge Events">
          <EventTable title="Bridge deposits, withdrawals, tolls, and refunds" events={lists.bridgeEvents} displayLimit={50} />
        </DetailSection>
        <DetailSection title="Participant Events">
          <EventTable title="Join, exit, address-pair, and public-key registration" events={lists.participantEvents} displayLimit={50} />
        </DetailSection>
        <DetailSection title="Private-State Public Signal Events">
          <EventTable title="Accepted transitions and storage/accounting signals" events={lists.privateStateEvents} displayLimit={50} />
          <EventTable title="Commitments and nullifiers" events={lists.commitmentEvents} displayLimit={50} />
          <EventTable title="Encrypted payloads" events={lists.encryptedPayloadEvents} displayLimit={50} />
        </DetailSection>
        <DetailSection title="Raw Recent Events">
          <EventTable title="Recent public events excluding policy, verification, admin, and upgrade events" events={lists.recentEvents} displayLimit={50} />
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
            <InfoItem label="Proxy addresses" value="not indexed" />
            <InfoItem label="Implementation addresses" value="not indexed" />
            <InfoItem label="Proxy admin addresses" value="not indexed" />
            <InfoItem label="Owner / admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
            <InfoItem label="Multisig / timelock" value="not indexed" />
            <InfoItem label="Channel leader" value={channel.leader ?? "unknown"} mono />
          </InfoGrid>
        </DetailSection>
        <DetailSection title="Deployment Metadata">
          <InfoGrid>
            <InfoItem label="Deployment block" value={channel.genesis_block} mono />
            <InfoItem label="Deployed Git commit" value="not indexed" />
            <InfoItem label="NPM package version" value="not indexed" />
            <InfoItem label="Source verification" value="not indexed" />
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
        <InfoGrid>
          <InfoItem label="Incident notices" value={channel.incident_notice ?? "No active incident notices"} />
          <InfoItem label="Emergency notice status" value={channel.incident_notice ? "active" : "none"} />
          <InfoItem label="Unaudited / experimental status" value="not indexed" />
        </InfoGrid>
      </DetailSection>
      <DetailSection title="Monitoring Status">
        <InfoGrid>
          <InfoItem label="Last observer sync" value={formatDate(dashboard.sync.updatedAt)} />
          <InfoItem label="Latest scanned block" value={dashboard.sync.lastScannedBlock ?? "not synced"} />
          <InfoItem label="Latest L1 block" value={dashboard.sync.latestBlock ?? "not synced"} />
        </InfoGrid>
      </DetailSection>
      <DetailSection title="Public Data Scope">
        <p className="section-note">
          The observer shows L1 bridge edges, channel registration, accepted transitions, commitments, nullifiers, encrypted note events, verifier information, and channel policy. It does not deanonymize private note transfers or reconstruct internal note provenance.
        </p>
      </DetailSection>
      <DetailSection title="Reference Links">
        <InfoGrid>
          <InfoItem label="Source code" value={<ExternalValue value={channel.source_code_url} />} />
          <InfoItem label="ABI" value={<ExternalValue value={channel.abi_url} />} />
          <InfoItem label="Explorer links" value="not indexed" />
          <InfoItem label="Monitoring packet / policy docs" value="not indexed" />
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

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
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
        <Link href={href}>Details</Link>
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

function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="info-grid">{children}</dl>;
}

function InfoItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

function EventTable({
  title,
  events,
  displayLimit,
}: {
  title: string;
  events: ObserverEventRow[];
  displayLimit: number;
}) {
  const visibleEvents = events.slice(0, displayLimit);
  return (
    <section className="event-block">
      <div className="event-heading">
        <h3>{title}</h3>
        <span>{visibleEvents.length === events.length ? events.length : `${visibleEvents.length} of ${events.length}`}</span>
      </div>
      <div className="table-wrap">
        <table>
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
                  <td className="mono">{shortHash(event.transaction_hash)}</td>
                  <td>
                    <DecodedFields value={event.decoded} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecodedFields({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).slice(0, 8);
  if (entries.length === 0) {
    return <span className="muted">empty</span>;
  }
  return (
    <dl className="decoded-fields">
      {entries.map(([key, field]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{formatDecodedValue(field)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExternalValue({ value }: { value: string | null }) {
  if (!value) {
    return "unavailable";
  }
  return (
    <a href={value} rel="noreferrer" target="_blank">
      {value}
    </a>
  );
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

function subtractTokenAmounts(left: string, right: string) {
  return (BigInt(left.split(".")[0] || "0") - BigInt(right.split(".")[0] || "0")).toString();
}

function formatDecodedValue(value: unknown) {
  if (typeof value === "string") {
    return shortHash(value);
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

function sumEventCounts(counts: Record<string, string>) {
  return Object.values(counts)
    .reduce((total, value) => total + BigInt(value), 0n)
    .toString();
}
