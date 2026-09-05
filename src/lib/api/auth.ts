import { env } from "@/lib/env";
import { ApiError } from "./respond";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() ?? null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** CLAUDE.md rule 9: cron endpoints check `Authorization: Bearer ${CRON_SECRET}` first. */
export function requireCron(req: Request): void {
  const token = bearer(req);
  if (!token || !safeEqual(token, env().CRON_SECRET)) throw new ApiError(401, "unauthorized", "Missing or invalid cron secret.");
}

export function requireAdmin(req: Request): void {
  const token = bearer(req);
  if (!token || !safeEqual(token, env().ADMIN_TOKEN)) throw new ApiError(401, "unauthorized", "Missing or invalid admin token.");
}
