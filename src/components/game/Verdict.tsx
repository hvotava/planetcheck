import { getTranslations } from "next-intl/server";
import { ArchetypeIllustration, type ArchetypeMeta } from "@/components/ui/ArchetypeBadge";
import { Dual } from "@/components/ui/Dual";
import { Flag } from "@/components/ui/Flag";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { AxisBars } from "@/components/viz/AxisBars";
import { Link } from "@/lib/i18n/navigation";
import type { SubmissionPayload } from "@/types/api";
import type { ScheduledRound } from "@/lib/api/rounds";
import { SignupForm } from "@/components/newsletter/SignupForm";
import { MoreRounds } from "@/components/game/MoreRounds";

/** Verdict screen (server component): archetype reveal, indices, axes, contradictions, share. */
export async function Verdict({
  submission: s,
  archetypes,
  pairs,
  questionTexts,
  countryLabel,
  shareUrl,
  ogUrl,
  unlockThreshold,
  nextRound,
  calendarUrl,
  locale,
  newsletter,
}: {
  submission: SubmissionPayload;
  archetypes: Record<string, ArchetypeMeta>;
  pairs: Record<string, { title: string; blurb?: string }>;
  questionTexts: Record<string, string>;
  countryLabel: string | null;
  shareUrl: string;
  ogUrl: string;
  unlockThreshold: number;
  nextRound: ScheduledRound | null;
  calendarUrl: string;
  locale: string;
  /** null when no email sender is configured — then no address is asked for at all */
  newsletter: { turnstileSiteKey: string | null } | null;
}) {
  const t = await getTranslations("result");
  const tc = await getTranslations("common");
  const meta = archetypes[s.archetype] ?? { key: s.archetype, title: s.archetype };
  const you = Math.round(s.survival * 100);
  const planetW = s.planet?.survival_weighted ?? null;
  const planetR = s.planet?.survival_raw ?? null;
  const shareText = t("shareText", { share: meta.share ?? "", planet: Math.round(planetW ?? 0), you });
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
      {/* hero */}
      <section className="card relative overflow-hidden p-6 text-center md:p-10" style={{ background: `radial-gradient(600px 300px at 50% 0%, ${meta.color ?? "var(--color-accent)"}22, var(--color-surface) 70%)` }}>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{t("title")}</p>
        <div className="mx-auto mt-4 w-40 animate-rise md:w-52">
          <ArchetypeIllustration archetype={s.archetype} size={208} className="h-auto w-full drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]" />
        </div>
        <h1 className="mt-4 text-3xl font-bold md:text-5xl" data-testid="archetype-title">
          {t("youAre")} {meta.title}
        </h1>
        {meta.blurb ? <p className="mx-auto mt-2 max-w-md text-balance text-muted">{meta.blurb}</p> : null}
        {s.trust === "verified" ? <span className="mt-3 inline-block rounded-full border border-accent px-3 py-1 text-xs text-accent">✓ {t("verifiedBadge")}</span> : null}
      </section>

      {/* survival */}
      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{t("survivalYou")}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular text-accent" data-testid="survival-you">
            {you} %
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{t("survivalPlanet")}</p>
          <Dual weighted={planetW} raw={planetR} size="lg" className="mt-1" />
        </div>
        <div className="card col-span-2 p-4 md:col-span-1">
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
            <Flag code={s.country_code} /> {countryLabel ?? tc("unknownCountry")}
          </p>
          {s.country?.unlocked ? (
            <p className="mt-1 font-display text-4xl font-bold tabular">{s.country.survival_index?.toFixed(0) ?? "–"} %</p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {countryLabel ? t("countryLocked", { country: countryLabel, threshold: unlockThreshold, missing: Math.max(0, unlockThreshold - (s.country?.submissions_count ?? 0)) }) : "–"}
            </p>
          )}
        </div>
      </section>

      {/* axes + components */}
      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-bold">{t("axesTitle")}</h2>
          <AxisBars you={s.axis_scores} compare={s.planet?.axis_means?.weighted} compareLabel={t("survivalPlanet")} />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-bold">{t("componentsTitle")}</h2>
          <ul className="space-y-3 text-sm">
            {[
              [t("consistency"), pct(s.consistency)],
              [t("compromise"), pct(s.compromise)],
              [t("realism"), s.realism == null ? null : pct(s.realism)],
            ].map(([label, v]) => (
              <li key={String(label)}>
                <div className="flex justify-between">
                  <span>{label}</span>
                  <span className="font-mono tabular text-muted">{v == null ? t("realismPending") : `${v} %`}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-info" style={{ width: `${v ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* contradictions */}
      <section className="card mt-4 p-5">
        <h2 className="text-lg font-bold">{t("contradictionsTitle")}</h2>
        {s.contradictions_hit.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("noContradictions")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {s.contradictions_hit.map((k) => (
              <li key={k} className="rounded-2xl border border-warm/30 bg-warm/5 p-3">
                <p className="font-semibold text-warm">⚡ {pairs[k]?.title ?? k}</p>
                {pairs[k]?.blurb ? <p className="mt-0.5 text-sm text-muted">{pairs[k]?.blurb}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* meta */}
      {s.meta_guesses.length ? (
        <section className="card mt-4 p-5">
          <h2 className="text-lg font-bold">{t("metaTitle")}</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {s.meta_guesses.map((m) => {
              const actual = m.actual_final ?? m.actual_at_submit ?? m.actual_now;
              return (
                <li key={m.question_id}>
                  <p className="text-muted">{questionTexts[m.question_key] ?? m.question_key}</p>
                  <div className="relative mt-2 h-3 rounded-full bg-surface-2">
                    {actual != null ? <span className="absolute inset-y-0 left-0 rounded-full bg-accent/60" style={{ width: `${actual}%` }} /> : null}
                    <span className="absolute inset-y-0 w-0.5 bg-warm" style={{ left: `${m.guess}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-xs tabular text-muted">
                    {t("survivalPlanet")}: {actual == null ? "–" : `${Math.round(actual)} %`} · {t("youShort")}: {m.guess} %
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* share */}
      <section className="card mt-4 p-5">
        <h2 className="text-lg font-bold">{t("shareTitle")}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ogUrl} alt={t("ogAlt")} width={1200} height={630} className="mt-3 w-full rounded-2xl border border-border" loading="lazy" />
        <div className="mt-4">
          <ShareButtons url={shareUrl} text={shareText} title={`${t("youAre")} ${meta.title}`} />
        </div>
        <p className="mt-2 text-xs text-faint">{t("shareFlagNote")}</p>
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        <Link href="/planet" className="rounded-full bg-accent px-5 py-3 font-semibold text-bg" data-testid="see-planet">
          {t("seePlanet")} →
        </Link>
        {s.country_code && countryLabel ? (
          <Link href={`/country/${s.country_code}`} className="rounded-full border border-border px-5 py-3 font-semibold hover:border-border-strong">
            {t("seeCountry", { country: countryLabel })}
          </Link>
        ) : null}
      </section>

      <MoreRounds locale={locale} excludeSlug={s.round.slug} />

      {/* when the next theme opens — and a calendar subscription, which needs nothing from the reader */}
      <section className="card mt-6 p-5" data-testid="next-round">
        <h2 className="text-lg font-bold">{t("nextRoundTitle")}</h2>
        <p className="mt-1 text-sm text-muted">
          {nextRound
            ? t("nextRoundLine", {
                title: nextRound.title,
                date: new Date(nextRound.starts_at).toLocaleDateString(locale, { day: "numeric", month: "long" }),
              })
            : t("nextRoundNone")}
        </p>
        <a href={calendarUrl} className="mt-4 inline-flex rounded-full border border-accent px-5 py-3 font-semibold text-accent" data-testid="calendar-cta">
          {t("calendarCta")}
        </a>
        <p className="mt-2 text-xs text-faint">{t("calendarHint")}</p>
        {newsletter ? (
          <div className="mt-5 border-t border-border pt-4">
            <SignupForm locale={locale} turnstileSiteKey={newsletter.turnstileSiteKey} compact />
          </div>
        ) : null}
      </section>

      {s.trust !== "verified" ? (
        <section className="card mt-6 flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold">{t("verifyTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("verifyText")}</p>
          </div>
          <Link href="/verify" className="shrink-0 rounded-full border border-accent px-5 py-3 text-center font-semibold text-accent">
            {t("verifyCta")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
