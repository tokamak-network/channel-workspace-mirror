import { notFound } from "next/navigation";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { overviewDashboardOptions } from "@/lib/observer/request-options";
import { ObserverOverview } from "./observer-view";

export default async function ObserverChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const costConfig = await getCachedObserverCostConfig(slug);
  const dashboard = await getCachedObserverDashboard(slug, overviewDashboardOptions(costConfig), costConfig, "page");
  if (!dashboard) {
    notFound();
  }

  return <ObserverOverview dashboard={dashboard} />;
}
