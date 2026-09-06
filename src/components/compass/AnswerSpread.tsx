"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CompassOptionShare, PlayCompassQuestion } from "@/types/api";

/**
 * What other people answered, shown right after a card. Says nothing about which answer is
 * true: during the deck the planet's opinion is public, the truth is not. Pure viz.
 */
export function AnswerSpread({
  question,
  chosenId,
  options,
  totalRaw,
  onNext,
  autoAdvanceMs = 2400,
}: {
  question: PlayCompassQuestion;
  chosenId: string;
  options: CompassOptionShare[] | null;
  totalRaw: number;
  onNext: () => void;
  autoAdvanceMs?: number;
}) {
  const t = useTranslations("compass");
  const [progress, setProgress] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced || !autoAdvanceMs) return;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / autoAdvanceMs);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        onNext();
      }
    }, 50);
    return () => clearInterval(id);
  }, [autoAdvanceMs, onNext, reduced]);

  const byId = new Map((options ?? []).map((o) => [o.option_id, o] as const));

  return (
    <div className="card mx-auto w-full max-w-sm p-5" role="status" aria-live="polite">
      <p className="text-xs uppercase tracking-wide text-muted">{t("planetSays")}</p>
      {totalRaw === 0 ? <p className="mt-1 text-sm text-muted">{t("firstVoter")}</p> : null}
      <ul className="mt-3 space-y-2">
        {question.options.map((o) => {
          const s = byId.get(o.id);
          const w = s?.share_weighted ?? 0;
          const isMine = o.id === chosenId;
          return (
            <li key={o.id} className="text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`flex min-w-0 items-center gap-2 ${isMine ? "font-semibold text-text" : "text-muted"}`}>
                  {o.icon ? <span aria-hidden="true">{o.icon}</span> : null}
                  <span className="line-clamp-1">{o.text}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular text-muted">
                  {totalRaw > 0 ? `${Math.round(w)} %` : "–"} <span className="text-faint">· {s?.raw ?? 0}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={`h-full rounded-full ${isMine ? "bg-accent" : "bg-border-strong"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, w)}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onNext} className="relative mt-5 w-full overflow-hidden rounded-full bg-surface-2 px-4 py-3 text-sm font-semibold hover:bg-surface-3">
        <span className="absolute inset-y-0 left-0 bg-accent/20 transition-[width]" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
        <span className="relative">{t("next")} →</span>
      </button>
    </div>
  );
}
