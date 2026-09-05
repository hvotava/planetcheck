"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PlayQuestion } from "@/types/api";

/** Meta question: guess the planet's % for the target option. Reveal compares with the live weighted share. */
export function MetaSlider({
  question,
  index,
  total,
  actual,
  onGuess,
  onNext,
}: {
  question: PlayQuestion;
  index: number;
  total: number;
  /** current weighted share of the target option, null when the planet has no data yet */
  actual: number | null | undefined;
  onGuess: (guess: number) => void;
  onNext: () => void;
}) {
  const t = useTranslations("play");
  const tc = useTranslations("play");
  const [value, setValue] = useState(35);
  const [revealed, setRevealed] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!revealed || actual == null) return;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setShown(Math.round(from + (actual - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [revealed, actual]);

  const delta = actual == null ? null : Math.abs(Math.round(actual) - value);
  const verdict = delta == null ? tc("metaNoData") : delta <= 5 ? tc("metaHit") : delta <= 15 ? tc("metaClose", { delta }) : tc("metaMiss", { delta });

  return (
    <div className="card mx-auto w-full max-w-sm p-6" style={{ background: "linear-gradient(160deg, var(--color-surface-2), var(--color-surface) 60%)" }}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-mono tabular">{t("progress", { current: index + 1, total })}</span>
        <span className="rounded-full border border-warm/40 px-2 py-0.5 text-warm">{t("metaTitle")}</span>
      </div>
      <h2 className="mt-5 text-balance text-2xl font-bold leading-snug">{question.text}</h2>
      <p className="mt-2 text-sm text-muted">{t("metaHint")}</p>

      {!revealed ? (
        <>
          <div className="my-8 text-center">
            <span className="font-display text-7xl font-bold tabular text-accent">{value}</span>
            <span className="text-3xl text-muted"> %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
            aria-label={question.text}
            aria-valuetext={`${value} %`}
          />
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>0 %</span>
            <span>50 %</span>
            <span>100 %</span>
          </div>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              onGuess(value);
              setRevealed(true);
            }}
          >
            {t("metaSubmit", { value })}
          </Button>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="relative h-4 overflow-hidden rounded-full bg-surface-2">
            {actual != null ? <motion.div className="absolute inset-y-0 left-0 bg-accent" initial={{ width: 0 }} animate={{ width: `${actual}%` }} transition={{ duration: 0.9 }} /> : null}
            <span className="absolute inset-y-0 w-0.5 bg-warm" style={{ left: `${value}%` }} aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-bold">{actual != null ? t("metaResultTitle", { actual: shown }) : t("metaNoData")}</p>
          <p className="text-sm text-muted">{t("metaYou", { guess: value })}</p>
          <p className="mt-2 text-base text-warm">{verdict}</p>
          <Button className="mt-6 w-full" variant="secondary" onClick={onNext}>
            {t("next")} →
          </Button>
        </motion.div>
      )}
    </div>
  );
}
