import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadArchetypes, loadCompass, loadContent, loadWeighting } from "@/lib/content/loader";
import { currentRound } from "@/lib/api/rounds";
import { pickLocalized } from "@/lib/content/i18n";
import { Link } from "@/lib/i18n/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "methodology" });
  return { title: t("title"), description: t("subtitle") };
}

/**
 * ARCHITECTURE §9: generated from the same constants the code uses (content/weighting.yaml,
 * the live round's survival_weights, archetype rules), never hand-written numbers.
 */
export default async function MethodologyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("methodology");
  const w = loadWeighting();
  const round = await currentRound();
  const sw = round?.survival_weights ?? loadContent().rounds[0]?.survival_weights ?? { consistency: 0.4, compromise: 0.35, realism: 0.25 };
  const archetypes = loadArchetypes().archetypes;
  const threshold = round?.unlock_threshold ?? 500;
  const compass = loadCompass();
  const facts = compass.questions.filter((q) => q.section === "fact");

  const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 leading-relaxed text-muted">{children}</p>;
  const H = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <h2 id={id} className="mt-10 scroll-mt-24 text-2xl font-bold">
      {children}
    </h2>
  );

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-balance text-lg text-muted">{t("subtitle")}</p>

      <H id="scoring">{t("scoringTitle")}</H>
      <P>{t("axesText")}</P>
      <P>{t("realismText")}</P>
      <P>{t("consistencyText")}</P>
      <P>{t("compromiseText")}</P>
      <P>{t("survivalText", { c: sw.consistency, k: sw.compromise, r: sw.realism })}</P>
      <P>{t("archetypeText")}</P>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-bg-elev p-4 font-mono text-xs text-muted">
        {archetypes.map((a) => `${a.key.padEnd(10)} when ${JSON.stringify(a.when)}`).join("\n")}
      </pre>

      <H id="contradiction">{t("contradictionTitle")}</H>
      <P>{t("contradictionText")}</P>

      <H id="weighting">{t("weightingTitle")}</H>
      <P>{t("countryWeightText", { lo: w.country_clamp[0], hi: w.country_clamp[1], min: w.min_country_submissions })}</P>
      <P>{t("rakingText", { min: w.min_demographic_submissions, iter: w.max_iterations, tol: w.tolerance, lo: w.cell_clamp[0], hi: w.cell_clamp[1] })}</P>
      <P>{t("normalizationText")}</P>

      <H id="unlock">{t("unlockTitle")}</H>
      <P>{t("unlockText", { threshold })}</P>

      <H id="compass">{t("compassTitle")}</H>
      <P>{t("compassScoring")}</P>
      <P>{t("compassSeparate")}</P>
      <P>{t("compassWeighting")}</P>
      <P>{t("compassStale")}</P>
      <h3 className="mt-6 text-lg font-bold">{t("compassSourcesTitle")}</h3>
      <ol className="mt-3 space-y-3">
        {facts.map((q) => (
          <li key={q.key} className="text-sm">
            <p className="text-muted">{pickLocalized(q.i18n, locale, q.review_required)?.value.text ?? q.key}</p>
            <p className="mt-0.5">
              <a href={q.source!.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-accent">
                {q.source!.name}
              </a>
              <span className="text-faint">
                {" · "}
                {t("compassAsOf", {
                  as_of: q.source!.as_of.toISOString().slice(0, 10),
                  review_by: q.source!.review_by.toISOString().slice(0, 10),
                })}
              </span>
            </p>
          </li>
        ))}
      </ol>

      <H id="trust">{t("trustTitle")}</H>
      <P>{t("trustText", { fast: w.too_fast_seconds, ip: w.rate_ip_per_hour, anon: w.rate_anon_per_hour })}</P>

      <H id="privacy">{t("privacyTitle")}</H>
      <P>{t("privacyText")}</P>

      <H id="sources">{t("sourcesTitle")}</H>
      <P>{t("sourcesText")}</P>

      <H id="constants">{t("constantsTitle")}</H>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-bg-elev p-4 font-mono text-xs text-muted">
        {JSON.stringify({ round: round ? { slug: round.slug, title: pickLocalized(round.i18n, locale)?.value.title, unlock_threshold: round.unlock_threshold, survival_weights: round.survival_weights } : null, weighting: w }, null, 2)}
      </pre>
      <Link href="/data" className="mt-6 inline-flex rounded-full border border-border px-5 py-3 font-semibold hover:border-border-strong">
        {t("exportCta")} →
      </Link>
    </article>
  );
}
