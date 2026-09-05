import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRepo } from "@/lib/db/server";
import { currentRound } from "@/lib/api/rounds";
import { memo } from "@/lib/api/cache";
import { archetypeMeta, titleMeta } from "@/lib/content/public";
import { pickLocalized } from "@/lib/content/i18n";
import { countryByCode, countryName } from "@/lib/countries";
import { ArchetypeBadge } from "@/components/ui/ArchetypeBadge";
import { Dual } from "@/components/ui/Dual";
import { Flag } from "@/components/ui/Flag";
import { AxisBars } from "@/components/viz/AxisBars";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; code: string }> }): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "country" });
  const name = countryName(code.toUpperCase(), locale);
  return { title: t("title", { country: name }), description: t("subtitle", { country: name }) };
}

export default async function CountryPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code: raw } = await params;
  setRequestLocale(locale);
  const code = raw.toUpperCase();
  if (!countryByCode(code)) notFound();
  const round = await currentRound();
  if (!round) notFound();
  const t = await getTranslations("country");
  const tc = await getTranslations("common");
  const tp = await getTranslations("planet");
  const repo = await getRepo();
  const [data, board, planet] = await memo(`country:${round.id}:${code}`, 30_000, () => Promise.all([repo.countryResults(round.id, code), repo.countryBoard(round.id), repo.planetResults(round.id)]));
  const name = countryName(code, locale);
  const archetypes = archetypeMeta(locale);
  const titles = titleMeta(locale);
  const stats = data.stats;
  const unlockedTotal = board.countries.filter((c) => c.unlocked).length;
  const count = Math.max(stats?.submissions_count ?? 0, data.live_count);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6">
      <header className="flex items-center gap-4">
        <Flag code={code} className="text-6xl" />
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">{name}</h1>
          <p className="text-sm text-muted">
            {data.population ? t("population", { value: data.population.toLocaleString(locale) }) : null}
            {stats?.rank ? ` · ${t("rankLine", { rank: stats.rank, total: unlockedTotal })}` : ""}
          </p>
        </div>
      </header>

      {!stats?.unlocked ? (
        <section className="card mt-6 p-6">
          <h2 className="text-xl font-bold">{t("lockedTitle", { country: name })}</h2>
          <p className="mt-1 text-muted">{t("lockedText", { threshold: data.unlock_threshold, count })}</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-info" style={{ width: `${Math.min(100, (count / data.unlock_threshold) * 100)}%` }} />
          </div>
          <Link href="/play" className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg">
            {t("unlockCta")} →
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{tc("planet") === "Planet" ? "Survival index" : "Index přežití"}</p>
              <Dual weighted={stats.survival_index} raw={data.questions.length ? planet.survival.raw : null} className="mt-1 text-accent" />
              <p className="mt-1 text-xs text-faint">
                {t("vsPlanet")}: {planet.survival.weighted?.toFixed(0) ?? "–"} %
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{tp("contradictionTitle")}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular">{stats.contradiction_index?.toFixed(0) ?? "–"} %</p>
              <p className="mt-1 text-xs text-faint">
                {t("vsPlanet")}: {planet.contradiction.weighted?.toFixed(0) ?? "–"} %
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{tc("votes", { count })}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular">{count}</p>
              <p className="mt-1 text-xs text-faint">{t("verified", { count: stats.verified_count })}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t("topArchetype")}</p>
              <div className="mt-2">{stats.top_archetype && archetypes[stats.top_archetype] ? <ArchetypeBadge meta={archetypes[stats.top_archetype]!} /> : "–"}</div>
            </div>
          </section>

          <section className="card mt-4 p-5">
            <h2 className="text-lg font-bold">{t("titlesTitle")}</h2>
            {stats.titles.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {stats.titles.map((k) => (
                  <li key={k} className="rounded-full border border-warm/40 bg-warm/10 px-3 py-1.5 text-sm" title={titles[k]?.blurb}>
                    {titles[k]?.emoji} {titles[k]?.title ?? k}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("noTitles")}</p>
            )}
          </section>

          <section className="card mt-4 p-5">
            <h2 className="mb-4 text-lg font-bold">{tp("archetypesTitle")}</h2>
            <AxisBars you={stats.axis_means.weighted ?? {}} compare={planet.axis_means.weighted} compareLabel={tc("planet")} />
          </section>

          {data.rivals.length ? (
            <section className="card mt-4 p-5">
              <h2 className="text-lg font-bold">{t("rivals")}</h2>
              <ul className="mt-2 divide-y divide-border">
                {data.rivals.map((r) => (
                  <li key={r.country_code} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/country/${r.country_code}`} className="flex items-center gap-2 hover:underline">
                      <span className="font-mono text-muted">#{r.rank}</span>
                      <Flag code={r.country_code} /> {countryName(r.country_code, locale)}
                    </Link>
                    <span className="font-mono tabular">{r.survival_index?.toFixed(0) ?? "–"} %</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">{t("questionsTitle")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.questions.map((q) => (
            <div key={q.question_id} className="card p-4">
              <p className="font-semibold">{pickLocalized(q.i18n, locale)?.value.text ?? q.key}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {q.options.map((o) => (
                  <li key={o.option_id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true">{o.icon}</span>
                        <span className="truncate">{pickLocalized(o.i18n, locale)?.value.text ?? o.key}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular">
                        {o.share_weighted == null ? "–" : `${o.share_weighted.toFixed(0)} %`}
                        <span className="text-faint"> · 🌍 {o.planet_share_weighted == null ? "–" : `${o.planet_share_weighted.toFixed(0)} %`}</span>
                      </span>
                    </div>
                    <div className="relative mt-1 h-1.5 rounded-full bg-surface-2">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${o.share_weighted ?? 0}%` }} />
                      <span className="absolute -top-0.5 h-2.5 w-0.5 bg-muted" style={{ left: `${o.planet_share_weighted ?? 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">{tc("n", { count: q.total_raw })}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
