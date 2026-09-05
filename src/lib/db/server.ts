import "server-only";
/**
 * Entry point for Next.js server code (API routes, server components).
 * Scripts import "@/lib/db" directly; app code must import from here so the
 * service credentials can never leak into a client bundle.
 */
export { getDb, getRepo, closeDb, Repo } from "./index";
export type { DbExecutor } from "./index";
