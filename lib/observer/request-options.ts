import type { ObserverDashboardOptions } from "./queries";
import type { ResolvedObserverCostConfig } from "./cost-config";

type ObserverSection = "overview" | "events" | "upgrades" | "participants" | "notices" | "other";

export function overviewDashboardOptions(costConfig: ResolvedObserverCostConfig): ObserverDashboardOptions {
  return {
    includeIncidents: incidentsForSection(costConfig, "overview"),
    listMode: defaultListMode(costConfig),
    eventListLimit: costConfig.eventListLimit,
  };
}

export function sectionDashboardOptions(
  costConfig: ResolvedObserverCostConfig,
  section: ObserverSection,
  eventListPages?: ObserverDashboardOptions["eventListPages"],
  eventLists?: ObserverDashboardOptions["eventLists"],
): ObserverDashboardOptions {
  return {
    includeIncidents: incidentsForSection(costConfig, section),
    includeParticipantAccounting: includeParticipantAccounting(costConfig, section),
    listMode: section === "events" ? "events" : section === "upgrades" ? "upgrades" : "none",
    eventListLimit: costConfig.eventListLimit,
    eventListPages,
    eventLists,
  };
}

export function apiDashboardOptions(costConfig: ResolvedObserverCostConfig): ObserverDashboardOptions {
  return {
    includeIncidents: incidentsForSection(costConfig, "overview"),
    listMode: defaultListMode(costConfig),
    eventListLimit: costConfig.eventListLimit,
  };
}

function defaultListMode(costConfig: ResolvedObserverCostConfig): ObserverDashboardOptions["listMode"] {
  if (costConfig.defaultListMode === "all") {
    return "all";
  }
  return "none";
}

function incidentsForSection(costConfig: ResolvedObserverCostConfig, section: ObserverSection): ObserverDashboardOptions["includeIncidents"] {
  if (costConfig.includeIncidentHistory === "none") {
    return false;
  }
  if (costConfig.includeIncidentHistory === "active_only") {
    return "active";
  }
  return section === "notices" ? true : "active";
}

function includeParticipantAccounting(costConfig: ResolvedObserverCostConfig, section: ObserverSection) {
  if (costConfig.includeParticipantAccounting === "always") {
    return true;
  }
  return costConfig.includeParticipantAccounting === "section_only" && section === "participants";
}
