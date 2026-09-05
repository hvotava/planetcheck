import { Pool } from "pg";
import { assertIdent, RpcError, type DbExecutor, type Json } from "./executor";

/** node-postgres executor for Railway Postgres. */
export function createPgExecutor(connectionString: string, sslmode?: string): DbExecutor {
  const wantsSsl = sslmode === "require" || /sslmode=require/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });

  return {
    kind: "pg",
    async rpc<T>(fn: string, args: Json = {}): Promise<T> {
      try {
        const r = await pool.query<{ r: T }>(`select ${assertIdent(fn)}($1::jsonb) as r`, [JSON.stringify(args)]);
        return (r.rows[0]?.r ?? null) as T;
      } catch (e) {
        throw new RpcError(fn, e instanceof Error ? e.message : String(e), e);
      }
    },
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const r = await pool.query(sql, params);
      return r.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
