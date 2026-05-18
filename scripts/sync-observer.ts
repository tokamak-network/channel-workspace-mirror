import { loadLocalEnv } from "../lib/env";
import { syncDefaultObserverChannel } from "../lib/observer/sync";

loadLocalEnv();

async function main() {
  const result = await syncDefaultObserverChannel(parseRawHistoryDir(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

function parseRawHistoryDir(args: string[]) {
  const rawHistoryFlagIndex = args.indexOf("--raw-history-dir");
  if (rawHistoryFlagIndex === -1) {
    return null;
  }
  const value = args[rawHistoryFlagIndex + 1];
  if (!value) {
    throw new Error("--raw-history-dir requires a directory path.");
  }
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
