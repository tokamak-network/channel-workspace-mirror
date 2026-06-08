import { notFound } from "next/navigation";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { type ObserverEventListName } from "@/lib/observer/queries";
import { sectionDashboardOptions } from "@/lib/observer/request-options";
import { ObserverSectionPage } from "../../observer-view";

const EVENT_LIST_PAGE_SIZES: Record<ObserverEventListName, number> = {
  bridgeEvents: 15,
  participantJoinEvents: 10,
  participantAddressPairEvents: 10,
  participantPublicKeyEvents: 10,
  participantExitEvents: 10,
  commitmentEvents: 15,
  encryptedPayloadEvents: 15,
  privateStateEvents: 15,
};

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

export const revalidate = 3600;

export function generateStaticParams() {
  return Object.keys(EVENT_LIST_PAGE_SIZES).map((eventList) => ({
    slug: "the-great-first-channel",
    eventList,
  }));
}

export default async function ObserverEventListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventList: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, eventList } = await params;
  const resolvedSearchParams = await searchParams;
  if (!isObserverEventList(eventList)) {
    notFound();
  }

  const costConfig = await getCachedObserverCostConfig(slug);
  const pageParam = EVENT_PAGE_PARAMS[eventList];
  const page = parsePageNumber(resolvedSearchParams[pageParam]);
  const limit = Math.min(EVENT_LIST_PAGE_SIZES[eventList], costConfig.eventListLimit);
  const dashboardOptions = sectionDashboardOptions(
    costConfig,
    "events",
    {
      [eventList]: {
        limit,
        offset: (page - 1) * limit,
      },
    },
    [eventList],
  );
  const dashboard = await getCachedObserverDashboard(slug, dashboardOptions, costConfig, "page");
  if (!dashboard) {
    notFound();
  }

  return (
    <ObserverSectionPage
      dashboard={dashboard}
      sectionId="events"
      searchParams={resolvedSearchParams}
      selectedEventList={eventList}
    />
  );
}

function isObserverEventList(value: string): value is ObserverEventListName {
  return Object.hasOwn(EVENT_LIST_PAGE_SIZES, value);
}

function parsePageNumber(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
