export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

/**
 * The only two operations the application needs from Postgres:
 *  - rpc(fn, args): call a `fn(p jsonb) returns jsonb` function (the SQL API in db/migrations/0003_*)
 *  - exec/query: raw SQL for migrations, type generation and tests
 * Implemented by `pg` (Railway) and PGlite (local dev, CI, unit tests) with identical semantics.
 */
export interface DbExecutor {
  readonly kind: "pg" | "pglite";
  rpc<T = unknown>(fn: string, args?: Json): Promise<T>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Multi-statement script (simple query protocol). Runs inside one transaction when wrapped in begin/commit. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function assertIdent(fn: string): string {
  if (!IDENT.test(fn)) throw new Error(`invalid function name: ${fn}`);
  return fn;
}

export class RpcError extends Error {
  constructor(
    public readonly fn: string,
    message: string,
    public readonly inner?: unknown,
  ) {
    super(`rpc ${fn}: ${message}`, { cause: inner });
    this.name = "RpcError";
  }
}
