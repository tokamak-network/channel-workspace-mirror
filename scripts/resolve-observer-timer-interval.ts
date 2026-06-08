import { loadLocalEnv } from "../lib/env";
import { getIndexerRuntimeConfig } from "../lib/indexer/config";
import { DEFAULT_OBSERVER_CHANNEL } from "../lib/observer/config";
import { resolveObserverCostConfig } from "../lib/observer/cost-config";

loadLocalEnv();

export function systemdInterval(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error("Observer sync interval must be a positive integer number of seconds.");
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}min`;
  }
  return `${seconds}s`;
}

async function main() {
  const channelSlug = process.argv[2] ?? DEFAULT_OBSERVER_CHANNEL.slug;
  const config = await getIndexerRuntimeConfig(channelSlug);
  const costConfig = resolveObserverCostConfig(config);
  process.stdout.write(systemdInterval(costConfig.syncMinIntervalSeconds));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
