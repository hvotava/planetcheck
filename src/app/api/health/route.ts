import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const repo = await getRepo();
  const h = await repo.health();
  return ok({ ...h, backend: repo.db.kind, version: process.env.npm_package_version ?? "dev" });
});
