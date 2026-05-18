import { loadLocalEnv } from "../lib/env";
import { syncDefaultObserverChannel } from "../lib/observer/sync";

loadLocalEnv();

async function main() {
  const result = await syncDefaultObserverChannel();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
