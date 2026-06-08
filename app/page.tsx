import { notFound } from "next/navigation";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { overviewDashboardOptions } from "@/lib/observer/request-options";
import { ObserverOverview } from "./observer/[slug]/observer-view";

const OBSERVER_CHANNEL_SLUG = "the-great-first-channel";

export const revalidate = 3600;

export default async function Home() {
  const costConfig = await getCachedObserverCostConfig(OBSERVER_CHANNEL_SLUG);
  const dashboard = await getCachedObserverDashboard(
    OBSERVER_CHANNEL_SLUG,
    overviewDashboardOptions(costConfig),
    costConfig,
    "page",
  );
  if (!dashboard) {
    notFound();
  }

  return <ObserverOverview dashboard={dashboard} />;
}
