import "./_env";
import { existsSync } from "node:fs";
import { dataBackend, env } from "@/lib/env";
import { createPgExecutor } from "@/lib/db/pg";
import { createPgliteExecutor } from "@/lib/db/pglite";
import { dropAll, runMigrations } from "@/lib/db/migrate";
import { removePgliteDir } from "@/lib/db";

/**
 * pnpm db:migrate            apply pending migrations (Railway: runs as the pre-deploy command)
 * pnpm db:migrate --reset    LOCAL ONLY: wipe and re-apply (pglite dir or a localhost Postgres)
 */
async function main() {
  const reset = process.argv.includes("--reset");
  const force = process.argv.includes("--force");
  const e = env();
  const backend = dataBackend(e);

  if (backend === "pglite") {
    if (reset && existsSync(e.PGLITE_DIR)) {
      removePgliteDir(e.PGLITE_DIR);
      console.log(`removed ${e.PGLITE_DIR}`);
    }
    const db = await createPgliteExecutor(e.PGLITE_DIR);
    const r = await runMigrations(db);
    console.log(`pglite ${e.PGLITE_DIR}: applied ${r.applied.length} (${r.applied.join(", ") || "none"}), skipped ${r.skipped.length}`);
    await db.close();
    return;
  }

  if (!e.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const host = new URL(e.DATABASE_URL).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (reset && !local && !force) {
    throw new Error(`refusing to reset a non-local database (${host}); pass --force if you really mean it`);
  }
  const db = createPgExecutor(e.DATABASE_URL, e.PGSSLMODE);
  try {
    if (reset) {
      await dropAll(db);
      console.log(`dropped schema public on ${host}`);
    }
    const r = await runMigrations(db);
    console.log(`postgres ${host}: applied ${r.applied.length} (${r.applied.join(", ") || "none"}), skipped ${r.skipped.length}`);
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
