import { notFound } from "next/navigation";
import { getObserverDashboard, type ObserverEventRow } from "@/lib/observer/queries";

export default async function ObserverChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dashboard = await getObserverDashboard(slug);
  if (!dashboard) {
    notFound();
  }

  const { channel, sync, stats, lists } = dashboard;

  return (
    <main className="observer-shell">
      <header className="observer-header">
        <div>
          <p className="eyebrow">Public Channel Observer</p>
          <h1>{channel.name}</h1>
          <p className="lede">
            This observer does not deanonymize private note transfers. It provides exchange-grade
            visibility into L1 bridge edges, channel registration, accepted transitions,
            commitments, nullifiers, encrypted note events, verifier versions, and channel policy.
          </p>
        </div>
        <dl className="sync-panel">
          <div>
            <dt>Last scanned block</dt>
            <dd>{sync.lastScannedBlock ?? "not synced"}</dd>
          </div>
          <div>
            <dt>Latest observed block</dt>
            <dd>{sync.latestBlock ?? "not synced"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDate(sync.updatedAt)}</dd>
          </div>
        </dl>
      </header>

      <section className="metric-grid" aria-label="Channel metrics">
        <Metric label="Latest accepted transition" value={stats.latestAcceptedTransition?.block_number ?? "none"} />
        <Metric label="Total L1 bridge deposits" value={formatTokenAmount(stats.totalL1BridgeDeposits)} />
        <Metric label="Total L1 bridge withdrawals" value={formatTokenAmount(stats.totalL1BridgeWithdrawals)} />
        <Metric label="Channel participants" value={stats.channelParticipantsCount} />
      </section>

      <section className="observer-section">
        <h2>Channel Policy</h2>
        <div className="key-values">
          <KeyValue label="Channel ID" value={channel.channel_id} />
          <KeyValue label="BridgeCore" value={channel.bridge_core} />
          <KeyValue label="ChannelManager" value={channel.channel_manager} />
          <KeyValue label="BridgeTokenVault" value={channel.bridge_token_vault} />
          <KeyValue label="Controller" value={channel.controller} />
          <KeyValue label="L2AccountingVault" value={channel.l2_accounting_vault} />
          <KeyValue label="Verifier version" value={`Tokamak ${channel.tokamak_verifier_version ?? "unknown"} / Groth16 ${channel.groth_verifier_version ?? "unknown"}`} />
          <KeyValue label="Channel policy hash" value={channel.function_root} />
          <KeyValue label="DApp metadata hash" value={channel.dapp_metadata_digest} />
          <KeyValue label="Admin wallet" value={channel.admin_wallet} />
          <KeyValue label="Incident notices" value={channel.incident_notice ?? "No active incident notices"} />
          <KeyValue label="Source / ABI" value={`${channel.source_code_url ?? "unavailable"} | ${channel.abi_url ?? "unavailable"}`} />
        </div>
      </section>

      <section className="observer-section">
        <h2>Event Counts</h2>
        <div className="metric-grid compact">
          {Object.entries(stats.eventCounts).map(([group, count]) => (
            <Metric key={group} label={group} value={count} />
          ))}
        </div>
      </section>

      <EventTable title="Channel Join List" events={lists.channelJoins} />
      <EventTable title="Registered L1/L2 Address Pairs" events={lists.registeredAddressPairs} />
      <EventTable title="Note-Receive Public Keys" events={lists.noteReceivePublicKeys} />
      <EventTable title="Commitment Event List" events={lists.commitmentEvents} />
      <EventTable title="Nullifier Event List" events={lists.nullifierEvents} />
      <EventTable title="Encrypted Payload Event List" events={lists.encryptedPayloadEvents} />
      <EventTable title="Upgrade History" events={lists.upgradeHistory} />
      <EventTable title="Recent Public Events" events={lists.recentEvents} />
    </main>
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

function KeyValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "unknown"}</dd>
    </div>
  );
}

function EventTable({ title, events }: { title: string; events: ObserverEventRow[] }) {
  return (
    <section className="observer-section">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Event</th>
              <th>Transaction</th>
              <th>Decoded</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={4}>No indexed events</td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={`${event.transaction_hash}-${event.log_index}`}>
                  <td>{event.block_number}</td>
                  <td>{event.event_name}</td>
                  <td>{shortHash(event.transaction_hash)}</td>
                  <td>
                    <code>{shortJson(event.decoded)}</code>
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

function shortJson(value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  return json.length > 240 ? `${json.slice(0, 237)}...` : json;
}
