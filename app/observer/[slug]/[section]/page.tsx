import { notFound } from "next/navigation";
import { getPrivateStateCliLatestVersion } from "@/lib/observer/npm-package";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { type ObserverEventListName, type ObserverEventListPage } from "@/lib/observer/queries";
import { sectionDashboardOptions } from "@/lib/observer/request-options";
import { isObserverSection, ObserverSectionPage } from "../observer-view";

const EVENT_PAGE_PARAMS: Record<ObserverEventListName, string> = {
  bridgeEvents: "bridgePage",
  participantJoinEvents: "joinsPage",
  participantAddressPairEvents: "addressPairsPage",
  participantPublicKeyEvents: "publicKeysPage",
  participantExitEvents: "exitsPage",
  commitmentEvents: "commitmentsPage",
  encryptedPayloadEvents: "encryptedPayloadsPage",
  privateStateEvents: "privateStatePage",
};

const EVENT_PAGE_SIZES: Record<ObserverEventListName, number> = {
  bridgeEvents: 15,
  participantJoinEvents: 10,
  participantAddressPairEvents: 10,
  participantPublicKeyEvents: 10,
  participantExitEvents: 10,
  commitmentEvents: 15,
  encryptedPayloadEvents: 15,
  privateStateEvents: 15,
};

export default async function ObserverChannelSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, section } = await params;
  const resolvedSearchParams = await searchParams;
  if (!isObserverSection(section)) {
    notFound();
  }

  const costConfig = await getCachedObserverCostConfig(slug);
  const dashboardOptions = sectionDashboardOptions(
    costConfig,
    observerSectionForOptions(section),
    section === "events" ? eventListPages(resolvedSearchParams, costConfig.eventListLimit) : undefined,
  );
  const [dashboard, npmPackageVersion] = await Promise.all([
    getCachedObserverDashboard(slug, dashboardOptions, costConfig, "page"),
    usesNpmPackageVersion(section) ? getPrivateStateCliLatestVersion(costConfig.npmVersionCacheTtlSeconds) : Promise.resolve(null),
  ]);
  if (!dashboard) {
    notFound();
  }

  return (
    <ObserverSectionPage
      dashboard={dashboard}
      sectionId={section}
      searchParams={resolvedSearchParams}
      npmPackageVersion={npmPackageVersion}
    />
  );
}

function usesNpmPackageVersion(section: string) {
  return section === "channel" || section === "upgrades";
}

function observerSectionForOptions(section: string) {
  if (section === "events" || section === "upgrades" || section === "participants" || section === "notices") {
    return section;
  }
  return "other";
}

function eventListPages(
  searchParams: Record<string, string | string[] | undefined>,
  eventListLimit: number,
): Partial<Record<ObserverEventListName, ObserverEventListPage>> {
  return Object.fromEntries(
    Object.entries(EVENT_PAGE_PARAMS).map(([listName, pageParam]) => {
      const page = parsePageNumber(searchParams[pageParam]);
      const pageSize = Math.min(EVENT_PAGE_SIZES[listName as ObserverEventListName], eventListLimit);
      return [
        listName,
        {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
      ];
    }),
  ) as Partial<Record<ObserverEventListName, ObserverEventListPage>>;
}

function parsePageNumber(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
