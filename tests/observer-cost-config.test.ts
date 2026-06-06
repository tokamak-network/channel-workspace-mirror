import assert from "node:assert/strict";
import test from "node:test";
import {
  isObserverSyncDue,
  resolveObserverCostConfig,
} from "../lib/observer/cost-config";

test("resolves cost profile defaults", () => {
  const resolved = resolveObserverCostConfig({ observer_cost_profile: "cost" } as any);
  assert.deepEqual(resolved, {
    profile: "cost",
    pageCacheTtlSeconds: 21600,
    apiCacheTtlSeconds: 21600,
    syncMinIntervalSeconds: 10800,
    defaultListMode: "none",
    eventListLimit: 10,
    includeParticipantAccounting: "false",
    includeIncidentHistory: "active_only",
    npmVersionCacheTtlSeconds: 86400,
  });
});

test("resolves balanced profile defaults", () => {
  const resolved = resolveObserverCostConfig({ observer_cost_profile: "balanced" } as any);
  assert.equal(resolved.profile, "balanced");
  assert.equal(resolved.syncMinIntervalSeconds, 1800);
  assert.equal(resolved.defaultListMode, "section_only");
  assert.equal(resolved.eventListLimit, 50);
});

test("resolves performance profile defaults", () => {
  const resolved = resolveObserverCostConfig({ observer_cost_profile: "performance" } as any);
  assert.equal(resolved.profile, "performance");
  assert.equal(resolved.syncMinIntervalSeconds, 300);
  assert.equal(resolved.defaultListMode, "section_only");
  assert.equal(resolved.eventListLimit, 100);
});

test("applies explicit runtime overrides", () => {
  const resolved = resolveObserverCostConfig({
    observer_cost_profile: "cost",
    observer_page_cache_ttl_seconds: 11,
    observer_api_cache_ttl_seconds: 12,
    observer_sync_min_interval_seconds: 13,
    observer_default_list_mode: "all",
    observer_event_list_limit: 14,
    observer_include_participant_accounting: "always",
    observer_include_incident_history: "full",
    observer_npm_version_cache_ttl_seconds: 15,
  } as any);
  assert.equal(resolved.pageCacheTtlSeconds, 11);
  assert.equal(resolved.apiCacheTtlSeconds, 12);
  assert.equal(resolved.syncMinIntervalSeconds, 13);
  assert.equal(resolved.defaultListMode, "all");
  assert.equal(resolved.eventListLimit, 14);
  assert.equal(resolved.includeParticipantAccounting, "always");
  assert.equal(resolved.includeIncidentHistory, "full");
  assert.equal(resolved.npmVersionCacheTtlSeconds, 15);
});

test("rejects invalid cost profile values", () => {
  assert.throws(
    () => resolveObserverCostConfig({ observer_cost_profile: "cheap" } as any),
    /observer_cost_profile must be one of cost, balanced, or performance/u,
  );
  assert.throws(
    () => resolveObserverCostConfig({ observer_cost_profile: "cost", observer_event_list_limit: 0 } as any),
    /observer_event_list_limit must be a positive integer/u,
  );
});

test("observer sync due gate uses last successful sync", () => {
  const now = new Date("2026-06-06T12:00:00.000Z");
  assert.equal(isObserverSyncDue(null, now, 300), true);
  assert.equal(isObserverSyncDue("not-a-date", now, 300), true);
  assert.equal(isObserverSyncDue("2026-06-06T11:56:00.000Z", now, 300), false);
  assert.equal(isObserverSyncDue("2026-06-06T11:55:00.000Z", now, 300), true);
});
