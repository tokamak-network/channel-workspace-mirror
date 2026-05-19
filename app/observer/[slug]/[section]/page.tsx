import { notFound } from "next/navigation";
import { getObserverDashboard } from "@/lib/observer/queries";
import { isObserverSection, ObserverSectionPage } from "../observer-view";

export default async function ObserverChannelSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug, section } = await params;
  if (!isObserverSection(section)) {
    notFound();
  }

  const dashboard = await getObserverDashboard(slug);
  if (!dashboard) {
    notFound();
  }

  return <ObserverSectionPage dashboard={dashboard} sectionId={section} />;
}
