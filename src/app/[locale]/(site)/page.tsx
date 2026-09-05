import { getTranslations, setRequestLocale } from "next-intl/server";
import { LiveEkg } from "@/components/planet/LiveEkg";
import { Dual } from "@/components/ui/Dual";
import { TwoCamps } from "@/components/viz/TwoCamps";
import { CountryBoard } from "@/components/viz/CountryBoard";
import { Link } from "@/lib/i18n/navigation";
import { loadPlanetPage } from "@/lib/api/planet-data";

export const dynamic = "force-dynamic";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  const data = await loadPlanetPage(locale);
  const teaser = data.camps.slice(0, 2);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* hero */}
      <section className="grid items-center gap-8 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            {data.round ? t("roundTitle", { title: data.round.title }) : tc("live")}
          </p>
          {data.round?.ends_at ? (
            <p className="mb-3 text-xs text-faint">
              {t("roundEnds", { date: new Date(data.round.ends_at).toLocaleDateString(locale, { day: "numeric", month: "long" }) })}
            </p>
          ) : null}
          <h1 className="text-balance text-5xl font-bold leading-[0.95] md:text-7xl">{t("title")}</h1>
          <p className="mt-5 max-w-lg text-balance text-lg text-muted">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/play" className="glow inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-lg font-bold text-bg transition hover:bg-accent-deep" data-testid="cta-play">
              {t("cta")} →
            </Link>
            <span className="text-sm text-muted">{t("ctaSub")}</span>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("survivalIndex")}</dt>
              <dd>
                <Dual weighted={data.stats?.survival_weighted} raw={data.stats?.survival_raw} size="lg" className="mt-1 text-accent" />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{t("votesToday")}</dt>
              <dd className="mt-1 font-display text-4xl font-bold tabular">{data.stats?.votes_total ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">{tc("nav.countries")}</dt>
              <dd className="mt-1 font-display text-4xl font-bold tabular">{data.stats?.countries_unlocked ?? 0}</dd>
              <dd className="text-xs text-faint">{t("countriesUnlocked", { count: data.stats?.countries_unlocked ?? 0 })}</dd>
            </div>
          </dl>
        </div>
        <LiveEkg roundSlug={data.round?.slug ?? null} initialStats={data.stats} initialSeries={data.series} flash={data.round?.kind === "flash"} />
      </section>

      {/* how it works */}
      <section className="grid gap-4 md:grid-cols-3">
        {(["how1", "how2", "how3"] as const).map((k, i) => (
          <div key={k} className="card p-5">
            <p className="font-mono text-xs text-accent">0{i + 1}</p>
            <h3 className="mt-2 text-lg font-bold">{t(`${k}.title`)}</h3>
            <p className="mt-1 text-sm text-muted">{t(`${k}.text`)}</p>
          </div>
        ))}
      </section>

      {/* narrator */}
      {data.narrator ? (
        <section className="card mt-10 p-6" style={{ background: "linear-gradient(160deg, var(--color-surface-2), var(--color-surface))" }}>
          <p className="text-xs uppercase tracking-wide text-muted">🛰️ {t("narratorTitle")}</p>
          <p className="mt-3 text-balance text-lg leading-relaxed">{data.narrator.body}</p>
        </section>
      ) : null}

      {/* camps teaser */}
      {teaser.length ? (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-2xl font-bold">{t("campsTitle")}</h2>
            <Link href="/planet#camps" className="text-sm text-muted hover:text-text">
              {tc("nav.planet")} →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {teaser.map((c) => (
              <TwoCamps key={c.key} question={c.question} options={c.options} total={c.total} />
            ))}
          </div>
        </section>
      ) : null}

      {/* board */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold">{t("topCountries")}</h2>
          <Link href="/methodology" className="text-sm text-muted hover:text-text">
            {t("methodologyCta")} →
          </Link>
        </div>
        <CountryBoard countries={data.board} threshold={data.round?.unlock_threshold ?? 500} archetypes={data.archetypes} titles={data.titles} limit={8} />
      </section>
    </div>
  );
}
