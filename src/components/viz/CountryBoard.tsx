"use client";

import { useTranslations } from "next-intl";
import type { ArchetypeMeta } from "@/components/ui/ArchetypeBadge";
import { ArchetypeBadge } from "@/components/ui/ArchetypeBadge";
import { Flag } from "@/components/ui/Flag";
import { Link } from "@/lib/i18n/navigation";
import type { TitleMeta } from "@/lib/content/public";

export type BoardCountry = {
  code: string;
  name: string;
  survival_index: number | null;
  survival_raw?: number | null;
  contradiction_index: number | null;
  submissions_count: number;
  unlocked: boolean;
  insufficient_sample: boolean;
  top_archetype: string | null;
  titles: string[];
  rank: number | null;
};

/** Žebříček zemí — ranked unlocked countries, then locked ones with progress and nearest rival. */
export function CountryBoard({
  countries,
  threshold,
  archetypes,
  titles,
  highlight,
  limit,
}: {
  countries: BoardCountry[];
  threshold: number;
  archetypes: Record<string, ArchetypeMeta>;
  titles: Record<string, TitleMeta>;
  highlight?: string | null;
  limit?: number;
}) {
  const t = useTranslations("planet");
  const tc = useTranslations("common");
  const unlocked = countries.filter((c) => c.unlocked).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const locked = countries.filter((c) => !c.unlocked).sort((a, b) => b.submissions_count - a.submissions_count);
  const shownLocked = limit ? locked.slice(0, Math.max(0, limit - unlocked.length)) : locked;
  const shownUnlocked = limit ? unlocked.slice(0, limit) : unlocked;

  return (
    <div className="card overflow-hidden">
      <ol className="divide-y divide-border">
        {shownUnlocked.map((c) => (
          <li key={c.code} className={`flex items-center gap-3 px-4 py-3 ${highlight === c.code ? "bg-surface-2" : ""}`}>
            <span className="w-8 font-mono text-sm text-muted tabular">{t("rank", { rank: c.rank ?? "–" })}</span>
            <Flag code={c.code} className="text-xl" />
            <div className="min-w-0 flex-1">
              <Link href={`/country/${c.code}`} className="-my-1 inline-block py-1 font-semibold hover:underline">
                {c.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {c.top_archetype && archetypes[c.top_archetype] ? <ArchetypeBadge meta={archetypes[c.top_archetype]!} /> : null}
                {c.titles.map((k) => (
                  <span key={k} className="rounded-full bg-surface-2 px-2 py-0.5" title={titles[k]?.blurb}>
                    {titles[k]?.emoji} {titles[k]?.title ?? k}
                  </span>
                ))}
                {c.insufficient_sample ? <span className="text-faint">{t("insufficient")}</span> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold tabular text-accent">{c.survival_index == null ? "–" : `${c.survival_index.toFixed(0)} %`}</p>
              <p className="font-mono text-[11px] text-faint tabular">
                {tc("n", { count: c.submissions_count })}
                {c.contradiction_index != null ? ` · ⚡${c.contradiction_index.toFixed(0)} %` : ""}
              </p>
            </div>
          </li>
        ))}
        {shownLocked.map((c, i) => {
          const rival = i === 0 ? unlocked[unlocked.length - 1] : shownLocked[i - 1];
          const pct = Math.min(100, (c.submissions_count / threshold) * 100);
          return (
            <li key={c.code} className={`flex items-center gap-3 px-4 py-3 ${highlight === c.code ? "bg-surface-2" : ""}`}>
              <span className="w-8 text-center text-sm text-faint">🔒</span>
              <Flag code={c.code} className="text-xl opacity-70" />
              <div className="min-w-0 flex-1">
                <Link href={`/country/${c.code}`} className="-my-1 inline-block py-1 font-semibold text-muted hover:underline">
                  {c.name}
                </Link>
                <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-info" style={{ width: `${pct}%` }} />
                </div>
                {rival ? <p className="mt-0.5 text-xs text-faint">{t("rival", { country: rival.name })}</p> : null}
              </div>
              <div className="text-right font-mono text-xs text-muted tabular">{t("progress", { count: c.submissions_count, threshold })}</div>
            </li>
          );
        })}
      </ol>
      {countries.length === 0 ? <p className="p-6 text-center text-sm text-muted">{t("noData")}</p> : null}
    </div>
  );
}
