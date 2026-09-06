"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export type KnowledgeItem = { key: string; label: string; share_weighted: number | null; share_raw: number | null };

/**
 * How the planet does on each fact, against the line random clicking would produce.
 * Pure: data props in, SVG and bars out. Sorted worst first, because the facts the planet
 * gets wrong are the point of the whole exercise.
 */
export function KnowledgeBars({
  items,
  chance,
  knowledge,
  bias,
  limit,
}: {
  items: KnowledgeItem[];
  /** 0..1, the share random clicking would score */
  chance: number | null;
  knowledge: { raw: number | null; weighted: number | null };
  bias: { pessimistic: number; optimistic: number };
  limit?: number;
}) {
  const t = useTranslations("compass");
  const tc = useTranslations("common");
  const chancePct = chance == null ? null : chance * 100;
  const sorted = [...items].sort((a, b) => (a.share_weighted ?? 0) - (b.share_weighted ?? 0));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const wrongTotal = bias.pessimistic + bias.optimistic;
  const belowChance = knowledge.weighted != null && chance != null && knowledge.weighted < chance;

  if (items.length === 0) return <p className="card p-6 text-center text-sm text-muted">{t("noData")}</p>;

  return (
    <div className="card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{t("indexTitle")}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular text-accent">
            {knowledge.weighted == null ? "–" : `${Math.round(knowledge.weighted * 100)} %`}
          </p>
          <p className="text-xs text-muted tabular">
            {tc("raw")}: {knowledge.raw == null ? "–" : `${Math.round(knowledge.raw * 100)} %`}
          </p>
        </div>
        {chancePct != null ? (
          <p className={`max-w-xs text-sm ${belowChance ? "font-semibold text-danger" : "text-muted"}`}>
            {belowChance ? t("worseThanChancePlanet") : t("planetHint", { chance: Math.round(chancePct) })}
          </p>
        ) : null}
      </div>

      {wrongTotal > 0 ? (
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="text-muted">{t("biasTitle")}:</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-danger" style={{ width: `${(bias.pessimistic / wrongTotal) * 100}%` }} />
            <div className="h-full bg-info" style={{ width: `${(bias.optimistic / wrongTotal) * 100}%` }} />
          </div>
          <span className="text-danger">{t("biasPessimistic")}</span>
          <span className="text-faint">/</span>
          <span className="text-info">{t("biasOptimistic")}</span>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2.5">
        {shown.map((item) => {
          const w = item.share_weighted ?? 0;
          const under = chancePct != null && w < chancePct;
          return (
            <li key={item.key} className="text-sm">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-muted">{item.label}</span>
                <span className="shrink-0 font-mono text-xs tabular">
                  <span className={under ? "text-danger" : "text-text"}>{item.share_weighted == null ? "–" : `${Math.round(w)} %`}</span>
                  <span className="text-faint"> · {tc("raw")} {item.share_raw == null ? "–" : `${Math.round(item.share_raw)} %`}</span>
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={`h-full rounded-full ${under ? "bg-danger" : "bg-accent"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(1, w)}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
                {chancePct != null ? (
                  <span className="absolute inset-y-0 w-0.5 bg-text/70" style={{ left: `${chancePct}%` }} title={`${Math.round(chancePct)} %`} aria-hidden="true" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
