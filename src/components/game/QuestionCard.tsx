"use client";

import { useTranslations } from "next-intl";
import type { PlayQuestion } from "@/types/api";

export function QuestionCard({ question, index, total, dim = false }: { question: PlayQuestion; index: number; total: number; dim?: boolean }) {
  const t = useTranslations("play");
  return (
    <div
      className={`card relative flex h-full w-full select-none flex-col justify-between overflow-hidden p-6 ${dim ? "opacity-60" : ""}`}
      style={{ background: "linear-gradient(160deg, var(--color-surface-2), var(--color-surface) 60%)" }}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-mono tabular">{t("progress", { current: index + 1, total })}</span>
        {question.fallback_locale ? <span className="rounded-full border border-border px-2 py-0.5">{t("fallbackLocale")}</span> : null}
        {question.anchor ? <span aria-hidden="true">⚓</span> : null}
      </div>
      <div className="my-6">
        {question.scenario ? <p className="mb-3 text-sm uppercase tracking-wide text-warm">{question.scenario}</p> : null}
        <h2 className="text-balance text-2xl font-bold leading-snug md:text-3xl">{question.text}</h2>
      </div>
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {question.options.map((o) => (
          <span key={o.id} className="text-xl">
            {o.icon}
          </span>
        ))}
      </div>
    </div>
  );
}
