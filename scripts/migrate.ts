import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../lib/env";
import { getSql } from "../lib/db";

loadLocalEnv();

async function main() {
  const sql = getSql();
  const migrationsDir = path.resolve("migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await sql.query(sqlText);
    console.log(`applied ${file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
