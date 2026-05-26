import { notFound } from "next/navigation";
import { getObserverDashboard } from "@/lib/observer/queries";
import { ObserverOverview } from "./observer-view";

export default async function ObserverChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dashboard = await getObserverDashboard(slug, {
    includeIncidents: "active",
    listMode: "none",
  });
  if (!dashboard) {
    notFound();
  }

  return <ObserverOverview dashboard={dashboard} />;
}
