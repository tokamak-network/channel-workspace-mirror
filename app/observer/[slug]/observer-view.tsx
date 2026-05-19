import Link from "next/link";
import type { ReactNode } from "react";
import type { ObserverDashboard, ObserverEventRow } from "@/lib/observer/queries";

type SectionId = "funds" | "participants" | "privacy" | "rules" | "verification" | "notices" | "audit";

type ObserverSectionDefinition = {
  id: SectionId;
  label: string;
  title: string;
  summary: string;
  audience: string;
};

export const observerSections: ObserverSectionDefinition[] = [
  {
    id: "funds",
    label: "Funds",
    title: "Bridge Funds",
    summary: "Deposits, withdrawals, canonical asset, and vault addresses.",
    audience: "Users",
  },
  {
    id: "participants",
    label: "Participants",
    title: "Participant Registry",
    summary: "Active members and public identity registration records.",
    audience: "Users / Operators",
  },
  {
    id: "privacy",
    label: "Privacy",
    title: "Privacy Signals",
    summary: "Commitments, nullifiers, and encrypted note payloads.",
    audience: "Reviewers",
  },
  {
    id: "rules",
    label: "Rules",
    title: "Channel Rules",
    summary: "Managers, controllers, accounting vaults, and metadata roots.",
    audience: "Operators / Reviewers",
  },
  {
    id: "verification",
    label: "Verification",
    title: "Proof Verification",
    summary: "Verifier contracts, versions, and upgrade history.",
    audience: "Reviewers",
  },
  {
    id: "notices",
    label: "Notices",
    title: "Governance Notices",
    summary: "Admin wallet, incident status, source references, and ABI links.",
    audience: "Everyone",
  },
  {
    id: "audit",
    label: "Audit",
    title: "Public Event Log",
    summary: "Indexed event counts and recent public records.",
    audience: "Reviewers",
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

      <section className="section-index" aria-label="Observer sections">
        {observerSections.map((section) => (
          <Link className="section-card" href={`/observer/${channel.slug}/${section.id}`} key={section.id}>
            <span>{section.label}</span>
            <strong>{section.title}</strong>
            <small>{section.summary}</small>
            <em>{section.audience}</em>
          </Link>
        ))}
      </section>

      <section className="overview-grid" aria-label="Key public records">
        <OverviewBlock title="Funds" href={`/observer/${channel.slug}/funds`}>
          <InfoItem label="Vault" value={channel.bridge_token_vault} mono />
          <InfoItem label="Recent bridge records" value={String(lists.bridgeEvents.length)} />
        </OverviewBlock>
        <OverviewBlock title="Participants" href={`/observer/${channel.slug}/participants`}>
          <InfoItem label="Active" value={stats.channelParticipantsCount} />
          <InfoItem label="Recent registrations" value={String(lists.channelJoins.length)} />
        </OverviewBlock>
        <OverviewBlock title="Verification" href={`/observer/${channel.slug}/verification`}>
          <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
          <InfoItem label="Groth16 verifier" value={channel.groth_verifier ?? "unknown"} mono />
        </OverviewBlock>
        <OverviewBlock title="Notices" href={`/observer/${channel.slug}/notices`}>
          <InfoItem label="Incident status" value={channel.incident_notice ?? "No active incident notices"} />
          <InfoItem label="Admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
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
      <ObserverHeader dashboard={dashboard} activeSection={sectionId} />
      <ObserverNav channelSlug={dashboard.channel.slug} activeSection={sectionId} />
      <nav className="breadcrumb" aria-label="Observer navigation">
        <Link href={`/observer/${dashboard.channel.slug}`}>Overview</Link>
        <span>{section.title}</span>
      </nav>
      <ObserverSection eyebrow={section.label} title={section.title} summary={section.summary}>
        <SectionDetail dashboard={dashboard} sectionId={sectionId} />
      </ObserverSection>
    </main>
  );
}

function ObserverHeader({
  dashboard,
}: {
  dashboard: ObserverDashboard;
  activeSection?: SectionId;
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
        Overview
      </Link>
      {observerSections.map((section) => (
        <Link
          className={activeSection === section.id ? "active" : undefined}
          href={`/observer/${channelSlug}/${section.id}`}
          key={section.id}
        >
          {section.label}
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

  if (sectionId === "funds") {
    return (
      <>
        <InfoGrid>
          <InfoItem label="BridgeCore" value={channel.bridge_core} mono />
          <InfoItem label="BridgeTokenVault" value={channel.bridge_token_vault} mono />
          <InfoItem label="Canonical asset" value={channel.canonical_asset ?? "unknown"} mono />
          <InfoItem label="Total deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
          <InfoItem label="Total withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        </InfoGrid>
        <EventTable title="Bridge activity" events={lists.bridgeEvents} displayLimit={50} />
      </>
    );
  }

  if (sectionId === "participants") {
    return (
      <>
        <InfoGrid>
          <InfoItem label="Active participants" value={stats.channelParticipantsCount} />
          <InfoItem label="DApp ID" value={channel.dapp_id} mono />
          <InfoItem label="Leader" value={channel.leader ?? "unknown"} mono />
          <InfoItem label="Channel ID" value={channel.channel_id} mono />
        </InfoGrid>
        <EventTable title="Joins" events={lists.channelJoins} displayLimit={50} />
        <EventTable title="Registered L1/L2 address pairs" events={lists.registeredAddressPairs} displayLimit={50} />
        <EventTable title="Note-receive public keys" events={lists.noteReceivePublicKeys} displayLimit={50} />
      </>
    );
  }

  if (sectionId === "privacy") {
    return (
      <>
        <EventTable title="Commitments" events={lists.commitmentEvents} displayLimit={50} />
        <EventTable title="Nullifiers" events={lists.nullifierEvents} displayLimit={50} />
        <EventTable title="Encrypted payloads" events={lists.encryptedPayloadEvents} displayLimit={50} />
      </>
    );
  }

  if (sectionId === "rules") {
    return (
      <InfoGrid>
        <InfoItem label="ChannelManager" value={channel.channel_manager} mono />
        <InfoItem label="Controller" value={channel.controller ?? "unknown"} mono />
        <InfoItem label="L2AccountingVault" value={channel.l2_accounting_vault ?? "unknown"} mono />
        <InfoItem label="Function root" value={channel.function_root ?? "unknown"} mono />
        <InfoItem label="DApp metadata schema" value={channel.dapp_metadata_digest_schema ?? "unknown"} />
        <InfoItem label="DApp metadata digest" value={channel.dapp_metadata_digest ?? "unknown"} mono />
      </InfoGrid>
    );
  }

  if (sectionId === "verification") {
    return (
      <>
        <InfoGrid>
          <InfoItem label="Verifier version" value={verifierVersion} />
          <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
          <InfoItem label="Groth16 verifier" value={channel.groth_verifier ?? "unknown"} mono />
        </InfoGrid>
        <EventTable title="Upgrade history" events={lists.upgradeHistory} displayLimit={50} />
      </>
    );
  }

  if (sectionId === "notices") {
    return (
      <InfoGrid>
        <InfoItem label="Admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
        <InfoItem label="Incident notices" value={channel.incident_notice ?? "No active incident notices"} />
        <InfoItem label="Source code" value={<ExternalValue value={channel.source_code_url} />} />
        <InfoItem label="ABI" value={<ExternalValue value={channel.abi_url} />} />
      </InfoGrid>
    );
  }

  return (
    <>
      <section className="metric-grid compact" aria-label="Event counts">
        {Object.entries(stats.eventCounts).map(([group, count]) => (
          <Metric key={group} label={eventGroupLabel(group)} value={count} />
        ))}
      </section>
      <EventTable title="Recent public events" events={lists.recentEvents} displayLimit={50} />
    </>
  );
}

function ObserverSection({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="observer-section">
      <div className="section-heading">
        <p className="section-eyebrow">{eyebrow}</p>
        <div>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div className="section-body">{children}</div>
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
  const whole = wei / 10n ** 18n;
  const fraction = wei % 10n ** 18n;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
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
