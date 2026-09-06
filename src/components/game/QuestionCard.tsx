"use client";

import { useTranslations } from "next-intl";
import type { DeckQuestion } from "./deck-types";

export function QuestionCard({
  question,
  index,
  total,
  dim = false,
  badge,
}: {
  question: DeckQuestion;
  index: number;
  total: number;
  dim?: boolean;
  /** Small label in the card header. The round deck uses it for anchors, the Kompas for its sections. */
  badge?: string | null;
}) {
  const t = useTranslations("play");
  return (
    <div
      className={`card relative flex h-full w-full select-none flex-col overflow-hidden p-6 ${dim ? "opacity-60" : ""}`}
      style={{ background: "linear-gradient(160deg, var(--color-surface-2), var(--color-surface) 60%)" }}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-mono tabular">{t("progress", { current: index + 1, total })}</span>
        {question.fallback_locale ? <span className="rounded-full border border-border px-2 py-0.5">{t("fallbackLocale")}</span> : null}
        {badge ? <span className="rounded-full border border-border px-2 py-0.5">{badge}</span> : null}
        {question.anchor ? <span aria-hidden="true">⚓</span> : null}
      </div>
      {/* Centred rather than pushed apart: a Kompas fact has no option icons, and
          justify-between would leave the question floating over an empty strip. */}
      <div className="flex flex-1 flex-col justify-center py-6">
        {question.scenario ? <p className="mb-3 text-sm uppercase tracking-wide text-warm">{question.scenario}</p> : null}
        <h2 className="text-balance text-2xl font-bold leading-snug md:text-3xl">{question.text}</h2>
      </div>
      {question.options.some((o) => o.icon) ? (
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {question.options.map((o) => (
            <span key={o.id} className="text-xl">
              {o.icon}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
