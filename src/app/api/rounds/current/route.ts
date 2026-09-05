import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { currentRound, roundBySlugOrCurrent } from "@/lib/api/rounds";
import { toPlayRound } from "@/lib/api/play";
import { fail, handle, ok } from "@/lib/api/respond";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { geoCountry } from "@/lib/trust/fingerprint";
import { isLocale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/rounds/current?locale=cs[&round=slug] — the deck for /play. Sets the anonymous cookie. */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale") ?? "en";
  const locale = isLocale(localeParam) ? localeParam : "en";
  const slug = url.searchParams.get("round");
  const round = slug ? await roundBySlugOrCurrent(slug) : await currentRound();
  if (!round) return fail(404, "no_round", "There is no live round right now.");

  const nreq = req as NextRequest;
  const { anonId, isNew } = readAnonId(nreq);
  const repo = await getRepo();
  const status = isNew ? null : await repo.voterStatus(round.id, anonId);
  const e = env();
  const payload = toPlayRound(round, locale, {
    turnstileSiteKey: e.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
    alreadyVoted: status?.submission_id ? { submission_id: status.submission_id } : null,
    geoCountry: geoCountry(req.headers),
  });
  const res = ok(payload);
  setAnonCookie(res, anonId, e.NODE_ENV === "production");
  return res;
});
