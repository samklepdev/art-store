#!/usr/bin/env node
// Applies db/migrations/*.sql in filename order, once each.
// schema.sql stays the baseline and is never edited.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const dir = path.join(process.cwd(), "db", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

const { rows } = await client.query("SELECT version FROM schema_migrations");
const applied = new Set(rows.map((r) => r.version));

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let count = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, "");
  if (applied.has(version)) continue;

  const sql = await readFile(path.join(dir, file), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
    count += 1;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`failed ${version}: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(count === 0 ? "already up to date" : `applied ${count} migration(s)`);
await client.end();
