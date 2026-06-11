import { unstable_cache } from "next/cache";
import { getObserverDashboard, getObserverEvents, type ObserverDashboardOptions } from "./queries";
import { getResolvedObserverCostConfig, type ResolvedObserverCostConfig } from "./cost-config";

const COST_CONFIG_CACHE_SECONDS = 3600;
const OBSERVER_DASHBOARD_CACHE_VERSION = "observer-dashboard-v2";
const OBSERVER_EVENTS_CACHE_VERSION = "observer-events-v2";

export function getCachedObserverCostConfig(channelSlug: string) {
  return unstable_cache(
    () => getResolvedObserverCostConfig(channelSlug),
    ["observer-cost-config", channelSlug],
    { revalidate: COST_CONFIG_CACHE_SECONDS },
  )();
}

export function getCachedObserverDashboard(
  slug: string,
  options: ObserverDashboardOptions,
  costConfig: ResolvedObserverCostConfig,
  cacheKind: "page" | "api",
) {
  const ttl = cacheKind === "api" ? costConfig.apiCacheTtlSeconds : costConfig.pageCacheTtlSeconds;
  return unstable_cache(
    () => getObserverDashboard(slug, options),
    [OBSERVER_DASHBOARD_CACHE_VERSION, slug, cacheKind, stableCacheKey({ options, costConfig })],
    { revalidate: ttl },
  )();
}

export function getCachedObserverEvents(
  slug: string,
  filters: { group?: string; event?: string; limit?: number },
  costConfig: ResolvedObserverCostConfig,
) {
  return unstable_cache(
    () => getObserverEvents(slug, filters),
    [OBSERVER_EVENTS_CACHE_VERSION, slug, stableCacheKey({ filters, costConfig })],
    { revalidate: costConfig.apiCacheTtlSeconds },
  )();
}

function stableCacheKey(value: unknown) {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)));
    }
    return entry;
  });
}
