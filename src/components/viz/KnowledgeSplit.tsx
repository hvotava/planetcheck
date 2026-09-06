"use client";

import { useTranslations } from "next-intl";

export type SplitOption = { key: string; label: string; low: number | null; mid: number | null; high: number | null; gap: number | null };
export type SplitQuestion = { key: string; label: string; options: SplitOption[] };
export type SplitBand = { band: "low" | "mid" | "high"; n: number; knowledge_mean: number | null; survival_mean: number | null };

const BAND_COLOR: Record<"low" | "mid" | "high", string> = {
  low: "var(--color-danger)",
  mid: "var(--color-muted)",
  high: "var(--color-accent)",
};

/**
 * Does knowing how the world is change how people vote? The round's answers split into
 * thirds by the voter's Kompas score. Pure: numbers in, bars out.
 *
 * Correlation, not cause: this cannot tell whether facts move opinions or whether the same
 * people who read carefully also answer carefully. The label says so.
 */
export function KnowledgeSplit({
  bands,
  questions,
  enough,
  minN,
  limit,
}: {
  bands: SplitBand[];
  questions: SplitQuestion[];
  enough: boolean;
  minN: number;
  limit?: number;
}) {
  const t = useTranslations("compass");

  if (!enough) return <p className="card p-6 text-center text-sm text-muted">{t("splitNotEnough", { min: minN })}</p>;

  // The cards worth showing are the ones where the thirds disagree most.
  const ranked = questions
    .map((q) => ({ q, top: [...q.options].sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))[0] }))
    .filter((x) => x.top && x.top.gap != null)
    .sort((a, b) => Math.abs(b.top!.gap!) - Math.abs(a.top!.gap!));
  const shown = limit ? ranked.slice(0, limit) : ranked;

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-3 divide-x divide-border">
        {(["low", "mid", "high"] as const).map((band) => {
          const b = bands.find((x) => x.band === band);
          return (
            <div key={band} className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide" style={{ color: BAND_COLOR[band] }}>
                {t(band === "low" ? "bandLow" : band === "mid" ? "bandMid" : "bandHigh")}
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular">{b?.knowledge_mean == null ? "–" : `${Math.round(b.knowledge_mean * 100)} %`}</p>
              <p className="text-xs text-faint tabular">n = {b?.n ?? 0}</p>
            </div>
          );
        })}
      </div>

      <ul className="space-y-3">
        {shown.map(({ q, top }) => (
          <li key={q.key} className="card p-4">
            <p className="font-semibold">{q.label}</p>
            <p className="mt-2 text-sm text-muted">{top!.label}</p>
            <ul className="mt-2 space-y-1.5">
              {(["low", "mid", "high"] as const).map((band) => {
                const v = top![band];
                return (
                  <li key={band} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted">{t(band === "low" ? "bandLow" : band === "mid" ? "bandMid" : "bandHigh")}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full" style={{ width: `${v ?? 0}%`, background: BAND_COLOR[band] }} />
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono tabular">{v == null ? "–" : `${Math.round(v)} %`}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-faint">
              {t("biggestGap")}: {top!.gap == null ? "–" : `${top!.gap > 0 ? "+" : ""}${Math.round(top!.gap)} b.`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
