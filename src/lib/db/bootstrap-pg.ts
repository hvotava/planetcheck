import "server-only";
import { Client } from "pg";
import { dataBackend, env } from "@/lib/env";
import { getDb, Repo } from "./index";
import { runMigrations } from "./migrate";

/**
 * Advisory-lock key for the schema bootstrap. Any constant works as long as nothing
 * else in the database uses it; it is namespaced by being a single fixed bigint.
 */
const BOOTSTRAP_LOCK = 8_531_207_411_003n;

/**
 * Brings a Railway Postgres up to date at server start: pending migrations, then
 * content/*.yaml. Both are idempotent, so every replica may call it.
 *
 * Serialised with `pg_advisory_lock` on a dedicated connection — a session-level lock
 * needs one client, which a pool cannot guarantee. The work itself goes through the
 * normal pooled executor while the lock is held.
 *
 * This exists because Railway's `preDeployCommand` is not applied to source uploads
 * (`railway up`); without it a deploy would silently keep serving the previous content.
 */
export async function bootstrapPg(): Promise<{ ran: boolean; applied: string[]; rounds: number } | { ran: false }> {
  const e = env();
  if (dataBackend(e) !== "pg" || !e.DATABASE_URL) return { ran: false };

  const wantsSsl = e.PGSSLMODE === "require" || /sslmode=require/.test(e.DATABASE_URL);
  const client = new Client({ connectionString: e.DATABASE_URL, ssl: wantsSsl ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [BOOTSTRAP_LOCK.toString()]);
    const db = await getDb();
    const { applied } = await runMigrations(db);
    const { syncContent } = await import("@/lib/content/sync");
    const { rounds } = await syncContent(new Repo(db), { log: () => undefined });
    return { ran: true, applied, rounds: rounds.length };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [BOOTSTRAP_LOCK.toString()]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
