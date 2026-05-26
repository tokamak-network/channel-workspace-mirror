import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getObserverDashboard } from "@/lib/observer/queries";
import { ObserverOverview } from "./observer/[slug]/observer-view";

const OBSERVER_HOST = "observer.tonnel.io";
const OBSERVER_CHANNEL_SLUG = "the-great-first-channel";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0];

  if (host === OBSERVER_HOST) {
    const dashboard = await getObserverDashboard(OBSERVER_CHANNEL_SLUG, {
      includeIncidents: "active",
      listMode: "none",
    });
    if (!dashboard) {
      notFound();
    }
    return <ObserverOverview dashboard={dashboard} />;
  }

  return (
    <main>
      <section>
        <h1>Channel Workspace Mirror</h1>
        <p>
          This deployment serves channel workspace mirror artifacts through the stable protocol
          paths under <code>/.well-known/tokamak-private-state/channel-workspace</code>.
        </p>
        <p className="home-link">
          <a href="/observer/the-great-first-channel">Open the-great-first-channel observer</a>
        </p>
      </section>
    </main>
  );
}
