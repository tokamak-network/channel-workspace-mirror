import {
  getIndexerRuntimeConfig,
  type IndexerRuntimeConfig,
} from "../indexer/config";

export type ObserverCostProfile = "cost" | "balanced" | "performance";
export type ObserverDefaultListMode = "none" | "section_only" | "all";
export type ObserverParticipantAccountingMode = "false" | "section_only" | "always";
export type ObserverIncidentHistoryMode = "none" | "active_only" | "full";

export type ResolvedObserverCostConfig = {
  profile: ObserverCostProfile;
  pageCacheTtlSeconds: number;
  apiCacheTtlSeconds: number;
  syncMinIntervalSeconds: number;
  defaultListMode: ObserverDefaultListMode;
  eventListLimit: number;
  includeParticipantAccounting: ObserverParticipantAccountingMode;
  includeIncidentHistory: ObserverIncidentHistoryMode;
  npmVersionCacheTtlSeconds: number;
};

type ObserverCostProfileDefaults = Omit<ResolvedObserverCostConfig, "profile">;

export const OBSERVER_COST_PROFILE_DEFAULTS: Record<ObserverCostProfile, ObserverCostProfileDefaults> = {
  cost: {
    pageCacheTtlSeconds: 21600,
    apiCacheTtlSeconds: 21600,
    syncMinIntervalSeconds: 10800,
    defaultListMode: "none",
    eventListLimit: 10,
    includeParticipantAccounting: "false",
    includeIncidentHistory: "active_only",
    npmVersionCacheTtlSeconds: 86400,
  },
  balanced: {
    pageCacheTtlSeconds: 1800,
    apiCacheTtlSeconds: 1800,
    syncMinIntervalSeconds: 1800,
    defaultListMode: "section_only",
    eventListLimit: 50,
    includeParticipantAccounting: "section_only",
    includeIncidentHistory: "active_only",
    npmVersionCacheTtlSeconds: 3600,
  },
  performance: {
    pageCacheTtlSeconds: 60,
    apiCacheTtlSeconds: 60,
    syncMinIntervalSeconds: 300,
    defaultListMode: "section_only",
    eventListLimit: 100,
    includeParticipantAccounting: "section_only",
    includeIncidentHistory: "full",
    npmVersionCacheTtlSeconds: 3600,
  },
};

export async function getResolvedObserverCostConfig(channelSlug: string) {
  return resolveObserverCostConfig(await getIndexerRuntimeConfig(channelSlug));
}

export function resolveObserverCostConfig(
  config: Pick<
    IndexerRuntimeConfig,
    | "observer_cost_profile"
    | "observer_page_cache_ttl_seconds"
    | "observer_api_cache_ttl_seconds"
    | "observer_sync_min_interval_seconds"
    | "observer_default_list_mode"
    | "observer_event_list_limit"
    | "observer_include_participant_accounting"
    | "observer_include_incident_history"
    | "observer_npm_version_cache_ttl_seconds"
  > | null,
): ResolvedObserverCostConfig {
  const profile = parseObserverCostProfile(config?.observer_cost_profile ?? defaultObserverCostProfile());
  const defaults = OBSERVER_COST_PROFILE_DEFAULTS[profile];
  return {
    profile,
    pageCacheTtlSeconds: positiveIntegerOverride(config?.observer_page_cache_ttl_seconds, defaults.pageCacheTtlSeconds, "observer_page_cache_ttl_seconds"),
    apiCacheTtlSeconds: positiveIntegerOverride(config?.observer_api_cache_ttl_seconds, defaults.apiCacheTtlSeconds, "observer_api_cache_ttl_seconds"),
    syncMinIntervalSeconds: positiveIntegerOverride(config?.observer_sync_min_interval_seconds, defaults.syncMinIntervalSeconds, "observer_sync_min_interval_seconds"),
    defaultListMode: parseDefaultListMode(config?.observer_default_list_mode ?? defaults.defaultListMode),
    eventListLimit: positiveIntegerOverride(config?.observer_event_list_limit, defaults.eventListLimit, "observer_event_list_limit"),
    includeParticipantAccounting: parseParticipantAccountingMode(config?.observer_include_participant_accounting ?? defaults.includeParticipantAccounting),
    includeIncidentHistory: parseIncidentHistoryMode(config?.observer_include_incident_history ?? defaults.includeIncidentHistory),
    npmVersionCacheTtlSeconds: positiveIntegerOverride(config?.observer_npm_version_cache_ttl_seconds, defaults.npmVersionCacheTtlSeconds, "observer_npm_version_cache_ttl_seconds"),
  };
}

export function defaultObserverCostProfile() {
  const value = process.env.OBSERVER_COST_PROFILE;
  if (value == null || value.trim() === "") {
    return "performance";
  }
  return parseObserverCostProfile(value);
}

export function isObserverSyncDue(lastObserverSuccessAt: string | null | undefined, now: Date, syncMinIntervalSeconds: number) {
  if (!lastObserverSuccessAt) {
    return true;
  }
  const lastSuccess = Date.parse(lastObserverSuccessAt);
  if (!Number.isFinite(lastSuccess)) {
    return true;
  }
  return now.getTime() - lastSuccess >= syncMinIntervalSeconds * 1000;
}

function positiveIntegerOverride(value: number | null | undefined, fallback: number, name: string) {
  if (value == null) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseObserverCostProfile(value: string): ObserverCostProfile {
  if (value === "cost" || value === "balanced" || value === "performance") {
    return value;
  }
  throw new Error("observer_cost_profile must be one of cost, balanced, or performance.");
}

function parseDefaultListMode(value: string): ObserverDefaultListMode {
  if (value === "none" || value === "section_only" || value === "all") {
    return value;
  }
  throw new Error("observer_default_list_mode must be one of none, section_only, or all.");
}

function parseParticipantAccountingMode(value: string): ObserverParticipantAccountingMode {
  if (value === "false" || value === "section_only" || value === "always") {
    return value;
  }
  throw new Error("observer_include_participant_accounting must be one of false, section_only, or always.");
}

function parseIncidentHistoryMode(value: string): ObserverIncidentHistoryMode {
  if (value === "none" || value === "active_only" || value === "full") {
    return value;
  }
  throw new Error("observer_include_incident_history must be one of none, active_only, or full.");
}
