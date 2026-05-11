import fs from "node:fs";
import path from "node:path";

export function loadLocalEnv(cwd = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 1) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = unquote(trimmed.slice(separatorIndex + 1).trim());
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function unquote(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
