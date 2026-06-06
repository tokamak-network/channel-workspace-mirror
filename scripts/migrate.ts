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

  await ensureMigrationTable();
  if (await shouldBaselineExistingSchema()) {
    if (!process.argv.includes("--baseline-existing")) {
      throw new Error("Existing application schema has no migration history. Run with --baseline-existing only after confirming all repository migrations are already applied.");
    }
    await baselineExistingMigrations(files);
    console.log(`baselined ${files.length} existing migrations`);
    return;
  }

  const applied = await appliedMigrationFiles();
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    for (const statement of splitSqlStatements(sqlText)) {
      await sql.query(statement);
    }
    await recordMigration(file);
    console.log(`applied ${file}`);
  }
}

async function ensureMigrationTable() {
  const sql = getSql();
  await sql.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function shouldBaselineExistingSchema() {
  const [applied, existingSchema] = await Promise.all([
    appliedMigrationFiles(),
    hasExistingApplicationSchema(),
  ]);
  return applied.size === 0 && existingSchema;
}

async function hasExistingApplicationSchema() {
  const sql = getSql();
  const rows = await sql`
    select to_regclass('public.mirror_publish_history') is not null as exists
  ` as { exists: boolean }[];
  return rows[0]?.exists === true;
}

async function appliedMigrationFiles() {
  const sql = getSql();
  const rows = await sql`
    select filename
    from schema_migrations
    order by filename
  ` as { filename: string }[];
  return new Set(rows.map((row) => row.filename));
}

async function baselineExistingMigrations(files: string[]) {
  for (const file of files) {
    await recordMigration(file);
  }
}

async function recordMigration(file: string) {
  const sql = getSql();
  await sql`
    insert into schema_migrations (filename, applied_at)
    values (${file}, now())
    on conflict (filename) do nothing
  `;
}

function splitSqlStatements(sqlText: string) {
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
