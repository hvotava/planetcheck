import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { handle } from "@/lib/api/respond";
import { hashToken } from "@/lib/newsletter/tokens";
import { routing } from "@/lib/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/newsletter/confirm?token=… — the second half of double opt-in.
 * A GET is correct here: the reader is following a link from their own inbox, and confirming
 * twice is harmless. Unsubscribing, which is destructive, needs a POST instead.
 */
export const GET = handle(async (req) => {
  const e = env();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const site = e.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const repo = await getRepo();
  const res = token ? await repo.newsletterConfirm(hashToken(token, e.AUTH_SECRET)) : { ok: false, code: "invalid_token" };
  const locale = (res as { locale?: string }).locale ?? routing.defaultLocale;
  const state = res.ok ? "confirmed" : "invalid";
  return NextResponse.redirect(`${site}/${locale}/newsletter?state=${state}`, { status: 303 });
});
