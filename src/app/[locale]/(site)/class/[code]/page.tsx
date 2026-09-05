import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Dual } from "@/components/ui/Dual";
import { AxisBars } from "@/components/viz/AxisBars";
import { currentRound } from "@/lib/api/rounds";
import { pickLocalized } from "@/lib/content/i18n";
import { loadWeighting } from "@/lib/content/loader";
import { getRepo } from "@/lib/db/server";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; code: string }> }): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "classroom" });
  return { title: t("resultsTitle", { code: code.toUpperCase() }), robots: { index: false } };
}

/** /class/[code] — one class's answers next to the planet's. Nothing shows below the privacy floor. */
export default async function ClassResultsPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code: raw } = await params;
  setRequestLocale(locale);
  const code = raw.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) notFound();
  const round = await currentRound();
  if (!round) notFound();
  const repo = await getRepo();
  const data = await repo.classResults(code, round.id, loadWeighting().min_class_submissions);
  if (!data) notFound();
  const t = await getTranslations("classroom");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <p className="text-xs uppercase tracking-wide text-muted">{t("classLabel")}</p>
      <h1 className="text-3xl font-bold">
        {data.class.label ?? t("untitled")} <span className="font-mono text-xl text-accent">{data.class.code}</span>
      </h1>
      <p className="mt-1 text-muted">{t("votesSoFar", { n: data.n })}</p>

      {!data.enough ? (
        <div className="card mt-6 p-6 text-center" data-testid="class-too-small">
          <p className="text-4xl">🔒</p>
          <h2 className="mt-2 text-xl font-bold">{t("tooSmallTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("tooSmallText", { min: data.min_n, missing: Math.max(0, data.min_n - data.n) })}</p>
          <Link href={`/play?class=${code}`} className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg">
            {t("playCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4" data-testid="class-results">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{t("indexTitle")}</h2>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{t("survival")}</p>
                <Dual weighted={data.survival?.raw ?? null} raw={data.survival?.raw ?? null} size="lg" className="mt-1" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{t("compromise")}</p>
                <p className="mt-1 font-display text-3xl font-bold tabular">{fmt(data.survival?.compromise)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{t("consistency")}</p>
                <p className="mt-1 font-display text-3xl font-bold tabular">{fmt(data.survival?.consistency)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-faint">{t("noWeighting")}</p>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">{t("axesTitle")}</h2>
            <AxisBars you={(data.axis_means.raw ?? {}) as Record<string, number | null>} />
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">{t("questionsTitle")}</h2>
            <ul className="space-y-6">
              {data.questions.map((q) => (
                <li key={q.question_id}>
                  <p className="font-semibold">{pickLocalized(q.i18n, locale)?.value.text ?? q.key}</p>
                  <ul className="mt-2 space-y-2">
                    {q.options.map((o) => (
                      <li key={o.option_id} className="text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-muted">
                            <span aria-hidden="true">{o.icon}</span>
                            <span className="truncate">{pickLocalized(o.i18n, locale)?.value.text ?? o.key}</span>
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular text-faint">
                            {t("classShort")} {fmt(o.share_raw)} · {t("planetShort")} {fmt(o.planet_share_weighted)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, o.share_raw ?? 0)}%` }} />
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(1, o.planet_share_weighted ?? 0)}%` }} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

const fmt = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(Number(v))} %`);
