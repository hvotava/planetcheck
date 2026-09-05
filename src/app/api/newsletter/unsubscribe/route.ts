import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";
import { readUnsubscribeToken } from "@/lib/newsletter/tokens";
import { routing } from "@/lib/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/newsletter/unsubscribe?token=… — removal.
 *
 * POST on purpose. Mail security scanners and clients prefetch links, and a GET here would let
 * them unsubscribe people who never asked. This same URL is what the List-Unsubscribe header
 * points at, so one-click unsubscribe (RFC 8058) works from the mail client too.
 */
export const POST = handle(async (req) => {
  const e = env();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return ok({ status: "invalid" });
  const id = readUnsubscribeToken(token, e.AUTH_SECRET);
  if (!id) return ok({ status: "invalid" });
  const repo = await getRepo();
  const res = await repo.newsletterUnsubscribe(id);

  // A mail client doing one-click expects a plain 200, not a redirect or JSON it must parse.
  if ((req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) {
    return new NextResponse("OK", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return ok({ status: res.ok ? "unsubscribed" : "invalid" });
});

/** A prefetching scanner that follows the link with GET must not remove anyone. */
export const GET = handle(async (req) => {
  const e = env();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const site = e.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return NextResponse.redirect(`${site}/${routing.defaultLocale}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, { status: 303 });
});
