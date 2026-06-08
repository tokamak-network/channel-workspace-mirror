import { notFound } from "next/navigation";
import { getPrivateStateCliLatestVersion } from "@/lib/observer/npm-package";
import { getCachedObserverCostConfig, getCachedObserverDashboard } from "@/lib/observer/cached-queries";
import { sectionDashboardOptions } from "@/lib/observer/request-options";
import { isObserverSection, observerSections, ObserverSectionPage } from "../observer-view";

export const revalidate = 3600;

export function generateStaticParams() {
  return observerSections.map((section) => ({
    slug: "the-great-first-channel",
    section: section.id,
  }));
}

export default async function ObserverChannelSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug, section } = await params;
  if (!isObserverSection(section)) {
    notFound();
  }

  const costConfig = await getCachedObserverCostConfig(slug);
  const dashboardOptions = sectionDashboardOptions(
    costConfig,
    observerSectionForOptions(section),
    undefined,
    section === "events" ? [] : undefined,
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
      selectedEventList={null}
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
