import { getSql } from "../db";
import { DEFAULT_OBSERVER_CHANNEL } from "./config";
import type { ObserverIncidentRow } from "./queries";

const INCIDENT_STATUSES = ["active", "resolved"] as const;
const INCIDENT_SEVERITIES = ["info", "warning", "critical"] as const;

export type IncidentStatus = typeof INCIDENT_STATUSES[number];
export type IncidentSeverity = typeof INCIDENT_SEVERITIES[number];

export type IncidentInput = {
  channelSlug?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  title?: string;
  body?: string;
  referenceUrl?: string | null;
  openedAt?: string;
  resolvedAt?: string | null;
};

type IncidentChannel = {
  chain_id: string;
  channel_id: string;
};

export async function listAdminIncidents(channelSlug = DEFAULT_OBSERVER_CHANNEL.slug) {
  const sql = getSql();
  const channel = await incidentChannel(channelSlug);
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
    order by opened_at desc, id desc
    limit 500
  ` as ObserverIncidentRow[];
  return rows;
}

export async function createIncident(input: IncidentInput) {
  const sql = getSql();
  const channel = await incidentChannel(input.channelSlug ?? DEFAULT_OBSERVER_CHANNEL.slug);
  const status = normalizeStatus(input.status ?? "active");
  const severity = normalizeSeverity(input.severity ?? "info");
  const title = requiredText(input.title, "title");
  const body = requiredText(input.body, "body");
  const referenceUrl = optionalText(input.referenceUrl);
  const openedAt = optionalTimestamp(input.openedAt, "openedAt");
  const resolvedAt = optionalTimestamp(input.resolvedAt, "resolvedAt");

  const rows = await sql`
    insert into observer_incidents (
      chain_id,
      channel_id,
      status,
      severity,
      title,
      body,
      reference_url,
      opened_at,
      resolved_at
    )
    values (
      ${channel.chain_id}::bigint,
      ${channel.channel_id},
      ${status},
      ${severity},
      ${title},
      ${body},
      ${referenceUrl},
      coalesce(${openedAt}::timestamptz, now()),
      ${resolvedAt}::timestamptz
    )
    returning
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
  ` as ObserverIncidentRow[];
  return rows[0];
}

export async function updateIncident(id: string, input: IncidentInput) {
  const sql = getSql();
  const incidentId = parseIncidentId(id);
  const currentRows = await sql`
    select *
    from observer_incidents
    where id = ${incidentId}::bigint
    limit 1
  ` as Array<{
    status: IncidentStatus;
    severity: IncidentSeverity;
    title: string;
    body: string;
    reference_url: string | null;
    opened_at: string;
    resolved_at: string | null;
  }>;
  const current = currentRows[0];
  if (!current) {
    throw new Error("Incident not found.");
  }

  const status = input.status === undefined ? current.status : normalizeStatus(input.status);
  const severity = input.severity === undefined ? current.severity : normalizeSeverity(input.severity);
  const title = input.title === undefined ? current.title : requiredText(input.title, "title");
  const body = input.body === undefined ? current.body : requiredText(input.body, "body");
  const referenceUrl = input.referenceUrl === undefined ? current.reference_url : optionalText(input.referenceUrl);
  const openedAt = input.openedAt === undefined ? current.opened_at : optionalTimestamp(input.openedAt, "openedAt");
  const resolvedAt = resolveResolvedAt(status, current.resolved_at, input.resolvedAt);

  const rows = await sql`
    update observer_incidents
    set
      status = ${status},
      severity = ${severity},
      title = ${title},
      body = ${body},
      reference_url = ${referenceUrl},
      opened_at = ${openedAt}::timestamptz,
      resolved_at = ${resolvedAt}::timestamptz,
      updated_at = now()
    where id = ${incidentId}::bigint
    returning
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
  ` as ObserverIncidentRow[];
  return rows[0];
}

async function incidentChannel(channelSlug: string): Promise<IncidentChannel> {
  const sql = getSql();
  const rows = await sql`
    select chain_id::text, channel_id
    from observer_channels
    where slug = ${channelSlug}
    limit 1
  ` as IncidentChannel[];
  const channel = rows[0];
  if (!channel) {
    throw new Error(`Observer channel not found: ${channelSlug}`);
  }
  return channel;
}

function normalizeStatus(value: string): IncidentStatus {
  if (INCIDENT_STATUSES.includes(value as IncidentStatus)) {
    return value as IncidentStatus;
  }
  throw new Error(`Unsupported incident status: ${value}`);
}

function normalizeSeverity(value: string): IncidentSeverity {
  if (INCIDENT_SEVERITIES.includes(value as IncidentSeverity)) {
    return value as IncidentSeverity;
  }
  throw new Error(`Unsupported incident severity: ${value}`);
}

function requiredText(value: string | undefined, fieldName: string) {
  const text = value?.trim();
  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }
  return text;
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function optionalTimestamp(value: string | null | undefined, fieldName: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }
  return timestamp.toISOString();
}

function resolveResolvedAt(
  status: IncidentStatus,
  currentResolvedAt: string | null,
  inputResolvedAt: string | null | undefined,
) {
  if (status === "active") {
    return inputResolvedAt === undefined ? currentResolvedAt : optionalTimestamp(inputResolvedAt, "resolvedAt");
  }
  if (inputResolvedAt !== undefined) {
    return optionalTimestamp(inputResolvedAt, "resolvedAt");
  }
  return currentResolvedAt ?? new Date().toISOString();
}

function parseIncidentId(value: string) {
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid incident id.");
  }
  return String(id);
}
