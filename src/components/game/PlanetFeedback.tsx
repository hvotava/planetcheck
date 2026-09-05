"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Flag } from "@/components/ui/Flag";
import type { PlayQuestion, QuestionShares } from "@/types/api";

/**
 * "Co říká planeta": the planet's distribution for the question just answered.
 * Shows weighted bars with the raw count alongside (rule 5), your choice highlighted.
 */
export function PlanetFeedback({
  question,
  chosenId,
  shares,
  countryCode,
  onNext,
  autoAdvanceMs = 2800,
}: {
  question: PlayQuestion;
  chosenId: string;
  shares: QuestionShares | null;
  countryCode: string | null;
  onNext: () => void;
  autoAdvanceMs?: number;
}) {
  const t = useTranslations("play");
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

  const total = shares?.total_raw ?? 0;
  const mine = shares?.options.find((o) => o.option_id === chosenId);
  const agree = mine?.share_weighted ?? null;
  const countryMine = shares?.country?.options.find((o) => o.option_id === chosenId);

  return (
    <div className="card mx-auto w-full max-w-sm p-5" role="status" aria-live="polite">
      <p className="text-xs uppercase tracking-wide text-muted">{t("planetSays")}</p>
      <p className="mt-1 text-lg font-bold">{total > 0 && agree != null ? t("agrees", { pct: Math.round(agree) }) : t("firstVoter")}</p>
      {countryMine?.share_weighted != null && shares?.country && shares.country.total_raw > 0 ? (
        <p className="mt-0.5 text-sm text-muted">
          <Flag code={countryCode} /> {Math.round(countryMine.share_weighted)} %
        </p>
      ) : null}
      <ul className="mt-4 space-y-2">
        {question.options.map((o) => {
          const s = shares?.options.find((x) => x.option_id === o.id);
          const w = s?.share_weighted ?? 0;
          const isMine = o.id === chosenId;
          return (
            <li key={o.id} className="text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`flex items-center gap-2 ${isMine ? "font-semibold text-text" : "text-muted"}`}>
                  <span aria-hidden="true">{o.icon}</span>
                  <span className="line-clamp-1">{o.text}</span>
                  {isMine ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-bg">{t("youChose")}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-xs tabular text-muted">
                  {total > 0 ? `${Math.round(w)} %` : "–"} <span className="text-faint">· {s?.raw ?? 0}</span>
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
