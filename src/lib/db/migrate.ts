import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DbExecutor } from "./executor";

export const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

/** Applies pending db/migrations/NNNN_*.sql in order, each in its own transaction. Append-only by design. */
export async function runMigrations(db: DbExecutor, dir = MIGRATIONS_DIR): Promise<{ applied: string[]; skipped: string[] }> {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(f))
    .sort();
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (done.has(f)) {
      skipped.push(f);
      continue;
    }
    const sql = readFileSync(join(dir, f), "utf8");
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
    applied.push(f);
  }
  return { applied, skipped };
}

/** Drops everything in `public` (local only!) — the caller must guard this. */
export async function dropAll(db: DbExecutor): Promise<void> {
  await db.exec("drop schema public cascade; create schema public;");
}
