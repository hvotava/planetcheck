import { NextRequest } from "next/server";
import { getRepo } from "@/lib/db/server";
import { handle, ok } from "@/lib/api/respond";
import { pickLocalized } from "@/lib/content/i18n";
import { readAnonId, setAnonCookie } from "@/lib/trust/anon";
import { env } from "@/lib/env";
import { isLocale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PlayableRound = {
  slug: string;
  kind: string;
  title: string;
  blurb: string | null;
  played: boolean;
  starts_at: string;
  ends_at: string | null;
  /** true while this deck is playable but its week has not arrived yet */
  upcoming: boolean;
};

/**
 * GET /api/rounds/playable?locale=cs — every round this visitor can still play.
 *
 * One vote per person per ROUND, not per person: `unique (round_id, voter_id)` has always
 * allowed a second round, we just never offered one. The anchors are the obvious next deck
 * once the weekly theme is done, and the weeks that are already written come after that —
 * `starts_at` decides what the site promotes, not what may be played.
 */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const asked = url.searchParams.get("locale") ?? "en";
  const locale = isLocale(asked) ? asked : "en";
  const { anonId, isNew } = readAnonId(req as NextRequest);
  const repo = await getRepo();
  const now = Date.now();

  const rounds = await repo.listRounds(false);
  const open = rounds.filter((r) => r.status === "live" && (!r.ends_at || new Date(r.ends_at).getTime() > now));

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
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      upcoming: new Date(r.starts_at).getTime() > now,
    });
  }
  // running weeks first, then the anchors, then the weeks that are written but not yet due
  const rank = (r: PlayableRound) => (r.upcoming ? 2 : r.kind === "weekly" ? 0 : 1);
  out.sort((a, b) => (rank(a) === rank(b) ? a.starts_at.localeCompare(b.starts_at) : rank(a) - rank(b)));

  const res = ok(out);
  setAnonCookie(res, anonId, env().NODE_ENV === "production");
  return res;
});
