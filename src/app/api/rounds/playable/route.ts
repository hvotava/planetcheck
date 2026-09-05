import { NextRequest } from "next/server";
import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";
import { pickLocalized } from "@/lib/content/i18n";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { env } from "@/lib/env";
import { isLocale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PlayableRound = { slug: string; kind: string; title: string; blurb: string | null; played: boolean; ends_at: string | null };

/**
 * GET /api/rounds/playable?locale=cs — every round this visitor can still play.
 *
 * One vote per person per ROUND, not per person: `unique (round_id, voter_id)` has always
 * allowed a second round, we just never offered one. The anchors are the obvious next deck
 * once the weekly theme is done.
 */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const asked = url.searchParams.get("locale") ?? "en";
  const locale = isLocale(asked) ? asked : "en";
  const { anonId, isNew } = readAnonId(req as NextRequest);
  const repo = await getRepo();
  const now = Date.now();

  const rounds = await repo.listRounds(false);
  const open = rounds.filter(
    (r) => r.status === "live" && new Date(r.starts_at).getTime() <= now && (!r.ends_at || new Date(r.ends_at).getTime() > now),
  );

  const out: PlayableRound[] = [];
  for (const r of open) {
    const status = isNew ? null : await repo.voterStatus(r.id, anonId);
    const l = pickLocalized(r.i18n as Record<string, { title: string; blurb?: string }>, locale)?.value;
    out.push({
      slug: r.slug,
      kind: r.kind,
      title: l?.title ?? r.slug,
      blurb: l?.blurb ?? null,
      played: !!status?.submission_id,
      ends_at: r.ends_at,
    });
  }
  // weekly first, then the anchors, so the current theme stays the headline offer
  out.sort((a, b) => (a.kind === b.kind ? a.slug.localeCompare(b.slug) : a.kind === "weekly" ? -1 : 1));

  const res = ok(out);
  setAnonCookie(res, anonId, env().NODE_ENV === "production");
  return res;
});
