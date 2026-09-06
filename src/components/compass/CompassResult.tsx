import { getTranslations } from "next-intl/server";
import { Dual } from "@/components/ui/Dual";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { AxisBars } from "@/components/viz/AxisBars";
import { Link } from "@/lib/i18n/navigation";
import { pickLocalized } from "@/lib/content/i18n";
import type { CompassPayload, CompassStats, CompassSubmissionPayload } from "@/types/api";

/**
 * The reveal (ARCHITECTURE §17). Everything the deck withheld arrives here at once:
 * which answers were right, what is actually true, and where the number came from.
 * Server component — the correct answers only exist on this page because the run is already in.
 */
export async function CompassResult({
  submission: s,
  deck,
  planet,
  locale,
  shareUrl,
}: {
  submission: CompassSubmissionPayload;
  deck: CompassPayload;
  planet: CompassStats | null;
  locale: string;
  shareUrl: string;
}) {
  const t = await getTranslations("compass");
  const tc = await getTranslations("common");

  const knowledge = s.knowledge == null ? null : Number(s.knowledge);
  const chance = s.chance == null ? null : Number(s.chance);
  const skill = s.skill == null ? null : Number(s.skill);
  const chanceCount = chance == null ? null : Math.round(chance * s.facts_total);
  const pess = Number(s.bias?.pessimistic ?? 0);
  const opt = Number(s.bias?.optimistic ?? 0);
  const wrong = pess + opt;

  const byQuestion = new Map(deck.questions.map((q) => [q.id, q] as const));
  const planetQ = new Map((planet?.questions ?? []).map((q) => [q.question_id, q] as const));
  const factAnswers = s.answers.filter((a) => a.section === "fact");
  const profileAnswers = s.answers.filter((a) => a.section !== "fact");

  const verdict =
    skill == null ? null : skill > 0.02 ? t("betterThanChance", { pct: Math.round(skill * 100) }) : skill < -0.02 ? t("worseThanChance") : t("sameAsChance");

  const shareText = t("shareText", { correct: s.facts_correct, total: s.facts_total, chance: chanceCount ?? "?" });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
      {/* score */}
      <section className="card relative overflow-hidden p-6 text-center md:p-10" style={{ backgroundImage: "radial-gradient(600px 300px at 50% 0%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)" }}>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{t("resultTitle")}</p>
        <p className="mt-4 font-display text-6xl font-bold tabular text-accent md:text-7xl" data-testid="compass-score">
          {s.facts_correct}
          <span className="text-3xl text-muted"> / {s.facts_total}</span>
        </p>
        {chanceCount != null ? <p className="mt-2 text-sm text-muted">{t("chanceLine", { chance: chanceCount, total: s.facts_total })}</p> : null}
        {verdict ? <p className="mt-4 text-balance text-xl font-semibold">{verdict}</p> : null}
        {planet?.knowledge.weighted != null ? (
          <p className="mt-2 text-sm text-muted">{t("planetKnows", { pct: Math.round(planet.knowledge.weighted * 100) })}</p>
        ) : null}
      </section>

      {/* index + bias */}
      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("indexTitle")}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular">{knowledge == null ? "–" : `${Math.round(knowledge * 100)} %`}</p>
          <p className="mt-2 text-xs text-faint">{t("indexHint", { chance: chance == null ? "–" : Math.round(chance * 100) })}</p>
          {planet ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wide text-muted">{tc("planet")}</p>
              <Dual weighted={planet.knowledge.weighted == null ? null : planet.knowledge.weighted * 100} raw={planet.knowledge.raw == null ? null : planet.knowledge.raw * 100} size="sm" className="mt-1" />
            </div>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("biasTitle")}</p>
          {wrong === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("biasNone")}</p>
          ) : (
            <>
              <p className="mt-2 text-balance font-semibold">{pess >= opt ? t("biasPessimisticLead") : t("biasOptimisticLead")}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {(
                  [
                    ["biasPessimistic", pess, "var(--color-danger)"],
                    ["biasOptimistic", opt, "var(--color-info)"],
                  ] as const
                ).map(([label, n, color]) => (
                  <li key={label}>
                    <div className="flex justify-between">
                      <span>{t(label)}</span>
                      <span className="font-mono tabular text-muted">{n}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${wrong > 0 ? (n / wrong) * 100 : 0}%`, background: color }} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* the reveal, card by card */}
      <section className="mt-6">
        <h2 className="mb-3 text-xl font-bold">{t("revealTitle")}</h2>
        <ol className="space-y-3">
          {factAnswers.map((a) => {
            const q = byQuestion.get(a.question_id);
            if (!q) return null;
            const mine = q.options.find((o) => o.id === a.option_id);
            const right = q.options.find((o) => o.correct);
            const text = pickLocalized(q.i18n, locale, q.review_required)?.value;
            const answer = q.i18n_answer ? pickLocalized(q.i18n_answer, locale, q.review_required)?.value.text : null;
            const share = planetQ.get(q.id)?.correct_share.weighted;
            return (
              <li key={a.question_id} className={`card p-5 ${a.correct ? "border-accent/40" : "border-warm/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {text?.scenario ? <p className="text-xs uppercase tracking-wide text-muted">{text.scenario}</p> : null}
                    <p className="font-semibold">{text?.text ?? q.key}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${a.correct ? "bg-accent text-bg" : "bg-warm/20 text-warm"}`}>
                    {a.correct ? `✓ ${t("correct")}` : `✕ ${t("wrong")}`}
                  </span>
                </div>
                {!a.correct && mine ? (
                  <p className="mt-3 text-sm text-muted">
                    {t("yourAnswer")}: <span className="line-through">{pickLocalized(mine.i18n, locale)?.value.text}</span>
                  </p>
                ) : null}
                {right ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted">{t("correctAnswer")}: </span>
                    <span className="font-semibold text-accent">{pickLocalized(right.i18n, locale)?.value.text}</span>
                  </p>
                ) : null}
                {answer ? <p className="mt-2 text-balance text-sm text-muted">{answer}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
                  {q.source ? (
                    <a href={q.source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-muted">
                      {t("source")}: {q.source.name}
                    </a>
                  ) : null}
                  {q.source ? <span>{t("asOf", { date: new Date(q.source.as_of).toLocaleDateString(locale) })}</span> : null}
                  {share != null ? <span>🌍 {Math.round(share)} %</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* profile */}
      {profileAnswers.length ? (
        <section className="card mt-6 p-5">
          <h2 className="text-xl font-bold">{t("profileTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("profileHint")}</p>
          <div className="mt-4">
            <AxisBars you={s.axis_scores} compare={planet?.axis_means?.weighted} compareLabel={tc("planet")} />
          </div>
        </section>
      ) : null}

      {/* share */}
      <section className="card mt-6 p-5">
        <h2 className="text-lg font-bold">{t("shareTitle")}</h2>
        <div className="mt-4">
          <ShareButtons url={shareUrl} text={shareText} title={t("resultTitle")} />
        </div>
        <p className="mt-3 text-xs text-faint">{t("retake")}</p>
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        <Link href="/planet" className="rounded-full bg-accent px-5 py-3 font-semibold text-bg">
          {t("seePlanet")} →
        </Link>
        <Link href="/play" className="rounded-full border border-border px-5 py-3 font-semibold hover:border-border-strong">
          {t("playCta")}
        </Link>
      </section>
    </div>
  );
}
