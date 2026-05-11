import path from "node:path";
import { loadLocalEnv } from "../lib/env";
import { publishMirrorUpload } from "../lib/publish";
import { validateMirrorUploadDirectory } from "../lib/manifest";

loadLocalEnv();

async function main() {
  const directory = parseDirectoryArg(process.argv.slice(2));
  const upload = await validateMirrorUploadDirectory(directory);
  const result = await publishMirrorUpload(upload);
  console.log(JSON.stringify(result, null, 2));
}

function parseDirectoryArg(args: string[]) {
  const directory = args[0] ?? args.find((arg) => !arg.startsWith("-"));
  if (!directory || args.includes("--help") || args.includes("-h")) {
    console.error([
      "Usage: npm run upload:local -- <mirror-public-directory>",
      "",
      "The directory must be the unmodified output of:",
      "private-state-cli channel publish-workspace-mirror --output <mirror-public-directory>",
    ].join("\n"));
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }
  return path.resolve(directory);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
