"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { api } from "@/lib/api/client";
import type { PlayableRound } from "@/app/api/rounds/playable/route";

/**
 * "Another deck now" — the rounds this visitor can still play.
 *
 * One vote per person per round has always allowed a second round; this is the first place
 * that says so. Rounds already played are shown as done rather than hidden, so it is obvious
 * that nothing is being withheld.
 */
export function MoreRounds({ locale, excludeSlug }: { locale: string; excludeSlug?: string }) {
  const t = useTranslations("play");
  const [rounds, setRounds] = useState<PlayableRound[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PlayableRound[]>(`/api/rounds/playable?locale=${locale}`)
      .then((r) => !cancelled && setRounds(r))
      .catch(() => !cancelled && setRounds([]));
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!rounds) return null;
  const open = rounds.filter((r) => !r.played && r.slug !== excludeSlug);
  if (open.length === 0) return null;

  return (
    <section className="card mt-4 p-5" data-testid="more-rounds">
      <h2 className="text-lg font-bold">{t("moreTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("moreSubtitle")}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {open.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/play?round=${r.slug}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 transition hover:border-accent"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{r.title}</span>
                {r.blurb ? <span className="mt-0.5 block text-xs text-muted">{r.blurb}</span> : null}
                {r.upcoming ? (
                  <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-faint">
                    {t("moreUpcoming", { date: new Date(r.starts_at).toLocaleDateString(locale, { day: "numeric", month: "long" }) })}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="shrink-0 text-accent">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
