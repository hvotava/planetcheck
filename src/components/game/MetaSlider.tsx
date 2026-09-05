"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PlayQuestion } from "@/types/api";

/**
 * Meta question: guess the planet's % for an option of the NEXT card, before seeing the card
 * or its distribution. Nothing is revealed here — PlanetFeedback of the target card shows
 * the guess next to the planet's share (ARCHITECTURE §8 realism, §11 meta placement).
 */
export function MetaSlider({ question, index, total, onGuess }: { question: PlayQuestion; index: number; total: number; onGuess: (guess: number) => void }) {
  const t = useTranslations("play");
  const [value, setValue] = useState(35);
  const [sent, setSent] = useState(false);

  return (
    <div className="card mx-auto w-full max-w-sm p-6" style={{ background: "linear-gradient(160deg, var(--color-surface-2), var(--color-surface) 60%)" }}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-mono tabular">{t("progress", { current: index + 1, total })}</span>
        <span className="rounded-full border border-warm/40 px-2 py-0.5 text-warm">{t("metaTitle")}</span>
      </div>
      {question.scenario ? <p className="mt-5 text-sm uppercase tracking-wide text-warm">{question.scenario}</p> : null}
      <h2 className={`${question.scenario ? "mt-2" : "mt-5"} text-balance text-2xl font-bold leading-snug`}>{question.text}</h2>
      <p className="mt-2 text-sm text-muted">{t("metaHint")}</p>

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
        disabled={sent}
        onChange={(e) => setValue(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-[var(--color-accent)]"
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
        disabled={sent}
        onClick={() => {
          if (sent) return;
          setSent(true);
          onGuess(value);
        }}
      >
        {t("metaSubmit", { value })}
      </Button>
    </div>
  );
}
