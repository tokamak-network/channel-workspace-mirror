import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getObserverDashboard, type ObserverEventRow } from "@/lib/observer/queries";

export default async function ObserverChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dashboard = await getObserverDashboard(slug);
  if (!dashboard) {
    notFound();
  }

  const { channel, sync, stats, lists } = dashboard;
  const verifierVersion = `Tokamak ${channel.tokamak_verifier_version ?? "unknown"} / Groth16 ${channel.groth_verifier_version ?? "unknown"}`;

  return (
    <main className="observer-shell">
      <header className="observer-header">
        <div>
          <p className="eyebrow">Public Channel Observer</p>
          <h1>{channel.name}</h1>
          <p className="lede">
            Shared public evidence for users, channel operators, and dispute or oversight reviewers.
          </p>
        </div>
        <dl className="status-strip" aria-label="Sync status">
          <InfoItem label="Scanned" value={sync.lastScannedBlock ?? "not synced"} />
          <InfoItem label="Latest L1" value={sync.latestBlock ?? "not synced"} />
          <InfoItem label="Updated" value={formatDate(sync.updatedAt)} />
        </dl>
      </header>

      <section className="metric-grid" aria-label="Channel metrics">
        <Metric label="Accepted transition" value={stats.latestAcceptedTransition?.block_number ?? "none"} />
        <Metric label="L1 deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
        <Metric label="L1 withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        <Metric label="Participants" value={stats.channelParticipantsCount} />
      </section>

      <ObserverSection
        eyebrow="Funds"
        title="Public Bridge Activity"
        summary="Public L1 deposit and withdrawal totals, plus the contracts that hold bridged assets."
      >
        <InfoGrid>
          <InfoItem label="BridgeCore" value={channel.bridge_core} mono />
          <InfoItem label="BridgeTokenVault" value={channel.bridge_token_vault} mono />
          <InfoItem label="Canonical asset" value={channel.canonical_asset ?? "unknown"} mono />
          <InfoItem label="Total deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
          <InfoItem label="Total withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        </InfoGrid>
      </ObserverSection>

      <ObserverSection
        eyebrow="Participation"
        title="Participant Registry"
        summary="Public registration records that connect channel membership to L1-visible identities."
      >
        <InfoGrid>
          <InfoItem label="Active participants" value={stats.channelParticipantsCount} />
          <InfoItem label="DApp ID" value={channel.dapp_id} mono />
          <InfoItem label="Leader" value={channel.leader ?? "unknown"} mono />
          <InfoItem label="Channel ID" value={channel.channel_id} mono />
        </InfoGrid>
        <EventTable title="Joins" events={lists.channelJoins} />
        <EventTable title="Registered L1/L2 address pairs" events={lists.registeredAddressPairs} />
        <EventTable title="Note-receive public keys" events={lists.noteReceivePublicKeys} />
      </ObserverSection>

      <ObserverSection
        eyebrow="Privacy"
        title="Privacy-Preserving Signals"
        summary="Commitments, nullifiers, and encrypted payloads that prove activity without exposing private transfers."
      >
        <EventTable title="Commitments" events={lists.commitmentEvents} />
        <EventTable title="Nullifiers" events={lists.nullifierEvents} />
        <EventTable title="Encrypted payloads" events={lists.encryptedPayloadEvents} />
      </ObserverSection>

      <ObserverSection
        eyebrow="Rules"
        title="Channel Rules"
        summary="Public policy roots and management contracts that define how this channel is governed."
      >
        <InfoGrid>
          <InfoItem label="ChannelManager" value={channel.channel_manager} mono />
          <InfoItem label="Controller" value={channel.controller ?? "unknown"} mono />
          <InfoItem label="L2AccountingVault" value={channel.l2_accounting_vault ?? "unknown"} mono />
          <InfoItem label="Function root" value={channel.function_root ?? "unknown"} mono />
          <InfoItem label="DApp metadata schema" value={channel.dapp_metadata_digest_schema ?? "unknown"} />
          <InfoItem label="DApp metadata digest" value={channel.dapp_metadata_digest ?? "unknown"} mono />
        </InfoGrid>
      </ObserverSection>

      <ObserverSection
        eyebrow="Verifier"
        title="Proof Verification"
        summary="Verifier contracts and versions that public reviewers can compare against channel claims."
      >
        <InfoGrid>
          <InfoItem label="Verifier version" value={verifierVersion} />
          <InfoItem label="Tokamak verifier" value={channel.tokamak_verifier ?? "unknown"} mono />
          <InfoItem label="Groth16 verifier" value={channel.groth_verifier ?? "unknown"} mono />
        </InfoGrid>
        <EventTable title="Upgrade history" events={lists.upgradeHistory} />
      </ObserverSection>

      <ObserverSection
        eyebrow="Notices"
        title="Governance and References"
        summary="Administrative wallet, incident notice status, and published implementation references."
      >
        <InfoGrid>
          <InfoItem label="Admin wallet" value={channel.admin_wallet ?? "unknown"} mono />
          <InfoItem label="Incident notices" value={channel.incident_notice ?? "No active incident notices"} />
          <InfoItem label="Source code" value={channel.source_code_url ?? "unavailable"} />
          <InfoItem label="ABI" value={channel.abi_url ?? "unavailable"} />
        </InfoGrid>
      </ObserverSection>

      <ObserverSection
        eyebrow="Audit"
        title="Public Event Log"
        summary="Indexed event counts and the latest public records used for review and reconciliation."
      >
        <section className="metric-grid compact" aria-label="Event counts">
          {Object.entries(stats.eventCounts).map(([group, count]) => (
            <Metric key={group} label={eventGroupLabel(group)} value={count} />
          ))}
        </section>
        <EventTable title="Recent public events" events={lists.recentEvents} />
      </ObserverSection>
    </main>
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

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

function EventTable({ title, events }: { title: string; events: ObserverEventRow[] }) {
  const visibleEvents = events.slice(0, 12);
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
