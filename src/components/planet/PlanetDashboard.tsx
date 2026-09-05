"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Dual } from "@/components/ui/Dual";
import { Section } from "@/components/ui/Section";
import { ArchetypeDonut } from "@/components/viz/ArchetypeDonut";
import { ContradictionMeter } from "@/components/viz/ContradictionMeter";
import { CountryBoard } from "@/components/viz/CountryBoard";
import { RulerSwitch, filterLabel } from "@/components/viz/RulerSwitch";
import { TrendLine } from "@/components/viz/TrendLine";
import { TwoCamps } from "@/components/viz/TwoCamps";
import { WorldMap } from "@/components/viz/WorldMap";
import { api } from "@/lib/api/client";
import { useRouter } from "@/lib/i18n/navigation";
import type { PlanetResults, ResultsFilterPayload } from "@/types/api";
import type { PlanetPageData } from "@/lib/api/planet-data";
import { LiveEkg } from "./LiveEkg";

type Localised = Pick<PlanetPageData, "round" | "stats" | "series" | "camps" | "pairs" | "board" | "map" | "codes" | "archetypes" | "titles" | "trend"> & {
  results: PlanetResults | null;
};

/** /planet — everything live. Filters re-fetch /api/results/planet; texts for options come from the initial payload. */
export function PlanetDashboard({ data }: { data: Localised }) {
  const t = useTranslations("planet");
  const tc = useTranslations("common");
  const td = useTranslations("demographics");
  const locale = useLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<ResultsFilterPayload>({});
  const [filtered, setFiltered] = useState<PlanetResults | null>(null);
  const [loading, setLoading] = useState(false);
  const active = Object.keys(filter).length > 0;

  useEffect(() => {
    if (!active) return setFiltered(null);
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>);
    if (data.round) qs.set("round", data.round.slug);
    setLoading(true);
    api<PlanetResults>(`/api/results/planet?${qs}`)
      .then(setFiltered)
      .catch(() => setFiltered(null))
      .finally(() => setLoading(false));
  }, [filter, active, data.round]);

  const results = filtered ?? data.results;
  const textFor = useMemo(() => {
    const m = new Map<string, { question: string; options: Map<string, { text: string; icon: string | null }> }>();
    for (const c of data.camps) m.set(c.key, { question: c.question, options: new Map(c.options.map((o) => [o.key, { text: o.text, icon: o.icon }])) });
    return m;
  }, [data.camps]);

  const camps = results
    ? results.questions.map((q) => ({
        key: q.key,
        question: textFor.get(q.key)?.question ?? q.key,
        total: q.total_raw,
        options: q.options.map((o) => ({ key: o.key, text: textFor.get(q.key)?.options.get(o.key)?.text ?? o.key, icon: o.icon, share_weighted: o.share_weighted, share_raw: o.share_raw, raw: o.raw })),
      }))
    : data.camps;
  const pairs = results ? results.pairs.map((p) => ({ ...data.pairs.find((x) => x.key === p.key), key: p.key, title: data.pairs.find((x) => x.key === p.key)?.title ?? p.key, share_weighted: p.share_weighted, share_raw: p.share_raw })) : data.pairs;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16 pt-6">
      <header>
        <h1 className="text-3xl font-bold md:text-4xl">{t("title")}</h1>
        <p className="mt-1 text-muted">{t("subtitle")}</p>
      </header>

      <LiveEkg roundSlug={data.round?.slug ?? null} initialStats={data.stats} initialSeries={data.series} flash={data.round?.kind === "flash"} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{tc("votes", { count: results?.totals.raw ?? 0 })}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular">{results?.totals.raw ?? 0}</p>
            <p className="text-xs text-faint">{results?.totals.verified ?? 0} {tc("verified")}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{useTranslationsLanding("survivalIndex")}</p>
            <Dual weighted={results?.survival.weighted} raw={results?.survival.raw} className="mt-1" />
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{t("contradictionTitle")}</p>
            <Dual weighted={results?.contradiction.weighted} raw={results?.contradiction.raw} className="mt-1" />
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{t("archetypesTitle")}</p>
            <p className="mt-1 line-clamp-2 font-display text-lg font-bold leading-tight md:text-xl">
              {(() => {
                const top = Object.entries(results?.archetypes ?? {}).sort((a, b) => (b[1].share_weighted ?? 0) - (a[1].share_weighted ?? 0))[0];
                return top ? `${data.archetypes[top[0]]?.emoji ?? ""} ${data.archetypes[top[0]]?.title ?? top[0]}` : "–";
              })()}
            </p>
          </div>
        </div>
        <RulerSwitch value={filter} onChange={setFilter} />
      </div>
      {active ? (
        <p className="rounded-2xl border border-warm/40 bg-warm/5 px-4 py-2 text-sm text-warm">
          {loading ? tc("loading") : t("filteredNote", { label: filterLabel(filter, td, t) })}
        </p>
      ) : null}

      <Section id="camps" title={t("campsTitle")} hint={t("campsHint")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {camps.map((c) => (
            <TwoCamps key={c.key} question={c.question} options={c.options} total={c.total} />
          ))}
        </div>
      </Section>

      <Section id="map" title={t("mapTitle")} hint={t("mapHint")}>
        <WorldMap countries={data.map} codes={data.codes} threshold={data.round?.unlock_threshold ?? 500} onSelect={(code) => router.push(`/country/${code}`)} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="contradictions" title={t("contradictionTitle")} hint={t("contradictionHint")}>
          <ContradictionMeter value={{ raw: results?.contradiction.raw ?? null, weighted: results?.contradiction.weighted ?? null }} pairs={pairs} />
        </Section>
        <Section id="archetypes" title={t("archetypesTitle")}>
          <ArchetypeDonut shares={results?.archetypes ?? {}} meta={data.archetypes} />
        </Section>
      </div>

      {data.trend.length > 1 ? (
        <Section id="trend" title={t("trendTitle")}>
          <TrendLine points={data.trend} />
        </Section>
      ) : null}

      <Section id="countries" title={t("boardTitle")} hint={t("boardHint", { threshold: data.round?.unlock_threshold ?? 500 })}>
        <CountryBoard countries={data.board} threshold={data.round?.unlock_threshold ?? 500} archetypes={data.archetypes} titles={data.titles} />
      </Section>
      <p className="text-xs text-faint">{locale}</p>
    </div>
  );
}

function useTranslationsLanding(key: "survivalIndex") {
  const t = useTranslations("landing");
  return t(key);
}
