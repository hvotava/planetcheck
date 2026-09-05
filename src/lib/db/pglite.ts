import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { assertIdent, RpcError, type DbExecutor, type Json } from "./executor";

/**
 * Embedded Postgres (WASM) executor. Same SQL, same functions, no Docker.
 * `dataDir` undefined → in-memory (tests); a path → persisted (local dev).
 */
export async function createPgliteExecutor(dataDir?: string): Promise<DbExecutor> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;

  return {
    kind: "pglite",
    async rpc<T>(fn: string, args: Json = {}): Promise<T> {
      try {
        const r = await db.query<{ r: T }>(`select ${assertIdent(fn)}($1::jsonb) as r`, [JSON.stringify(args)]);
        return (r.rows[0]?.r ?? null) as T;
      } catch (e) {
        throw new RpcError(fn, e instanceof Error ? e.message : String(e), e);
      }
    },
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const r = await db.query<T>(sql, params);
      return r.rows;
    },
    async exec(sql: string): Promise<void> {
      try {
        await db.exec(sql);
      } catch (e) {
        await db.exec("rollback").catch(() => undefined);
        throw e;
      }
    },
    async close() {
      await db.close();
    },
  };
}
