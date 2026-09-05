import { rmSync } from "node:fs";
import { dataBackend, env } from "@/lib/env";
import type { DbExecutor } from "./executor";
import { createPgExecutor } from "./pg";
import { createPgliteExecutor } from "./pglite";
import { runMigrations } from "./migrate";
import { Repo } from "./repo";

export type { DbExecutor } from "./executor";
export { Repo } from "./repo";

type Global = typeof globalThis & { __planetcheck_db?: Promise<DbExecutor>; __planetcheck_bootstrapped?: Promise<void> };
const g = globalThis as Global;

/**
 * Process-wide executor. On PGlite it also applies migrations and, if the DB is empty,
 * syncs content/ and seeds a small synthetic dataset — so `pnpm dev` works with zero setup.
 */
export function getDb(): Promise<DbExecutor> {
  if (!g.__planetcheck_db) {
    g.__planetcheck_db = (async () => {
      const e = env();
      if (dataBackend(e) === "pg") {
        if (!e.DATABASE_URL) throw new Error("DATABASE_URL is not set (PLANETCHECK_DATA=pg)");
        return createPgExecutor(e.DATABASE_URL, e.PGSSLMODE);
      }
      const db = await createPgliteExecutor(e.PGLITE_DIR);
      await runMigrations(db);
      return db;
    })();
    g.__planetcheck_db.catch(() => {
      g.__planetcheck_db = undefined;
    });
  }
  return g.__planetcheck_db;
}

export async function getRepo(): Promise<Repo> {
  const db = await getDb();
  const repo = new Repo(db);
  if (db.kind === "pglite") await bootstrapPglite(repo);
  return repo;
}

/** First-run convenience for the embedded DB: content + optional synthetic seed. Runs once per process. */
function bootstrapPglite(repo: Repo): Promise<void> {
  if (!g.__planetcheck_bootstrapped) {
    g.__planetcheck_bootstrapped = (async () => {
      const e = env();
      const health = await repo.health();
      if (health.rounds === 0) {
        const { syncContent } = await import("@/lib/content/sync");
        await syncContent(repo, { log: () => undefined });
      }
      const autoseed = e.PLANETCHECK_AUTOSEED ?? (e.NODE_ENV === "production" ? 0 : 600);
      if (autoseed > 0 && health.submissions === 0) {
        const { seedSynthetic } = await import("@/lib/seed/synthetic");
        const { recomputeAll } = await import("@/lib/recompute");
        await seedSynthetic(repo, { total: autoseed, countries: 25, log: () => undefined });
        await recomputeAll(repo, { log: () => undefined });
      }
    })();
    g.__planetcheck_bootstrapped.catch(() => {
      g.__planetcheck_bootstrapped = undefined;
    });
  }
  return g.__planetcheck_bootstrapped;
}

/** Local reset helper for scripts (never runs against a remote database). */
export function removePgliteDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export async function closeDb(): Promise<void> {
  if (g.__planetcheck_db) {
    const db = await g.__planetcheck_db;
    await db.close();
    g.__planetcheck_db = undefined;
    g.__planetcheck_bootstrapped = undefined;
  }
}
