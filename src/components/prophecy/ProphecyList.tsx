"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dual } from "@/components/ui/Dual";
import { TurnstileWidget } from "@/components/game/TurnstileWidget";
import { api, ClientApiError } from "@/lib/api/client";
import { forecastSkill, isOpenForGuesses } from "@/lib/prophecy/score";
import type { ProphecyStats } from "@/types/api";

export type ProphecyCardData = ProphecyStats & { title: string; blurb?: string; fallbackLocale: string | null };

type Answered = { guess: number; already: boolean; stats?: ProphecyStats | null };

/**
 * The forecasting list. The planet's average stays hidden until you have answered —
 * the same rule as the meta question in the deck: a number you have already seen is
 * not a forecast, it is an echo.
 */
export function ProphecyList({ prophecies, turnstileSiteKey }: { prophecies: ProphecyCardData[]; turnstileSiteKey: string | null }) {
  const [answers, setAnswers] = useState<Record<string, Answered>>({});
  // Without a token every guess would be flagged and silently excluded from the numbers,
  // so the widget belongs on this page just as much as on the deck.
  const token = useRef<string | null>(null);
  const open = prophecies.filter((p) => isOpenForGuesses(p));
  const settled = prophecies.filter((p) => !isOpenForGuesses(p));

  return (
    <div className="flex flex-col gap-8">
      {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} onToken={(t) => (token.current = t)} /> : null}
      {open.length ? (
        <ul className="flex flex-col gap-4">
          {open.map((p) => (
            <li key={p.key}>
              <ProphecyCard p={p} token={token} answered={answers[p.key]} onAnswered={(a) => setAnswers((s) => ({ ...s, [p.key]: a }))} />
            </li>
          ))}
        </ul>
      ) : null}
      {settled.length ? (
        <section>
          <SettledHeading />
          <ul className="mt-3 flex flex-col gap-4">
            {settled.map((p) => (
              <li key={p.key}>
                <ProphecyCard p={p} token={token} answered={{ guess: -1, already: true }} onAnswered={() => undefined} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SettledHeading() {
  const t = useTranslations("prophecy");
  return <h2 className="text-lg font-bold">{t("settledTitle")}</h2>;
}

function ProphecyCard({
  p,
  token,
  answered,
  onAnswered,
}: {
  p: ProphecyCardData;
  token: React.MutableRefObject<string | null>;
  answered?: Answered;
  onAnswered: (a: Answered) => void;
}) {
  const t = useTranslations("prophecy");
  const [value, setValue] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openNow = isOpenForGuesses(p);
  const revealed = !!answered || !openNow;
  // after answering, prefer the aggregate the server returned with the guess
  const shown = answered?.stats ?? p;
  const skill = forecastSkill(shown.brier.weighted ?? shown.brier.raw);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ stats: ProphecyStats | null }>(`/api/prophecies/guess`, {
        method: "POST",
        body: JSON.stringify({ key: p.key, probability: value, token: token.current }),
      });
      onAnswered({ guess: value, already: false, stats: res.stats });
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "duplicate") {
        const d = e.details as { stats?: ProphecyStats | null } | undefined;
        return onAnswered({ guess: value, already: true, stats: d?.stats ?? null });
      }
      if (e instanceof ClientApiError && e.code === "closed") return onAnswered({ guess: value, already: true });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card p-5" data-testid="prophecy-card" data-key={p.key}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
        <StatusPill status={p.status} outcome={p.outcome} />
      </div>
      {p.blurb ? <p className="mt-1 text-sm text-muted">{p.blurb}</p> : null}
      {p.fallbackLocale ? <p className="mt-1 text-xs text-faint">{t("fallbackLocale")}</p> : null}
      <p className="mt-2 text-xs text-faint">
        {t("closesAt", { date: new Date(p.closes_at).toLocaleDateString() })} · {t("resolvesAt", { date: new Date(p.resolves_at).toLocaleDateString() })}
      </p>

      {openNow && !answered ? (
        <div className="mt-5">
          <div className="text-center">
            <span className="font-display text-5xl font-bold tabular text-accent">{value}</span>
            <span className="text-2xl text-muted"> %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--color-accent)]"
            aria-label={p.title}
            aria-valuetext={`${value} %`}
          />
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>{t("no")}</span>
            <span>{t("maybe")}</span>
            <span>{t("yes")}</span>
          </div>
          <Button className="mt-4 w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? t("sending") : t("submit", { value })}
          </Button>
          <p className="mt-2 text-center text-xs text-faint">{t("hiddenHint")}</p>
          {error ? <p className="mt-2 text-center text-xs text-warm">{error}</p> : null}
        </div>
      ) : null}

      {revealed ? (
        <div className="mt-5 border-t border-border pt-4" data-testid="prophecy-reveal">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">{t("planetSays")}</p>
              <Dual weighted={shown.mean.weighted} raw={shown.mean.raw} size="lg" className="mt-1" />
            </div>
            {answered && answered.guess >= 0 ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted">{t("yourGuess")}</p>
                <p className="font-display text-2xl font-bold tabular">{answered.guess} %</p>
              </div>
            ) : null}
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted">{t("voices")}</p>
              <p className="font-display text-2xl font-bold tabular">{shown.n}</p>
            </div>
          </div>
          {answered?.already && answered.guess >= 0 ? <p className="mt-2 text-xs text-warm">{t("alreadyAnswered")}</p> : null}
          <Histogram histogram={shown.histogram} total={shown.n} />
          {shown.status === "resolved" ? (
            <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-3 text-sm">
              <p className="font-semibold">{shown.outcome ? t("happened") : t("didNotHappen")}</p>
              {shown.resolution_note ? <p className="mt-1 text-muted">{shown.resolution_note}</p> : null}
              <p className="mt-2 font-mono text-xs tabular text-muted">
                {t("brier")}: {shown.brier.weighted == null ? "–" : Number(shown.brier.weighted).toFixed(3)}
                {skill == null ? "" : ` · ${t("skill", { value: Math.round(skill * 100) })}`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Histogram({ histogram, total }: { histogram: Array<{ bucket: number; n: number }>; total: number }) {
  const t = useTranslations("prophecy");
  if (!total) return null;
  const byBucket = new Map(histogram.map((h) => [h.bucket, Number(h.n)]));
  const max = Math.max(1, ...histogram.map((h) => Number(h.n)));
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">{t("distribution")}</p>
      <div className="flex h-16 items-end gap-1" role="img" aria-label={t("distribution")}>
        {Array.from({ length: 10 }, (_, b) => {
          const n = byBucket.get(b) ?? 0;
          return (
            // the wrapper must be full height, otherwise a percentage height on the bar
            // resolves against an auto-height parent and collapses to the minimum
            <div key={b} className="flex h-full flex-1 flex-col justify-end" title={`${b * 10}–${b * 10 + 9} % · ${n}`}>
              <div className="rounded-t bg-accent/70" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>0 %</span>
        <span>50 %</span>
        <span>100 %</span>
      </div>
    </div>
  );
}

function StatusPill({ status, outcome }: { status: string; outcome: boolean | null }) {
  const t = useTranslations("prophecy");
  const label = status === "resolved" ? (outcome ? t("happened") : t("didNotHappen")) : t(`status.${status}`);
  const tone = status === "open" ? "border-accent text-accent" : status === "resolved" ? "border-info text-info" : "border-border text-muted";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{label}</span>;
}
