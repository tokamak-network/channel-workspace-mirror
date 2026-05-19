import { notFound } from "next/navigation";
import { getObserverDashboard, type ObserverEventListName, type ObserverEventListPage } from "@/lib/observer/queries";
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

  const dashboard = await getObserverDashboard(slug, {
    eventListPages: section === "events" ? eventListPages(resolvedSearchParams) : undefined,
  });
  if (!dashboard) {
    notFound();
  }

  return <ObserverSectionPage dashboard={dashboard} sectionId={section} searchParams={resolvedSearchParams} />;
}

function eventListPages(searchParams: Record<string, string | string[] | undefined>): Partial<Record<ObserverEventListName, ObserverEventListPage>> {
  return Object.fromEntries(
    Object.entries(EVENT_PAGE_PARAMS).map(([listName, pageParam]) => {
      const page = parsePageNumber(searchParams[pageParam]);
      return [
        listName,
        {
          limit: EVENT_PAGE_SIZES[listName as ObserverEventListName],
          offset: (page - 1) * EVENT_PAGE_SIZES[listName as ObserverEventListName],
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
