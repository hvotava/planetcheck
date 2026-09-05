"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

export type CampOption = { key: string; text: string; icon: string | null; share_weighted: number | null; share_raw: number | null; raw: number };

const PALETTE = ["var(--color-accent)", "var(--color-warm)", "var(--color-info)", "var(--color-them)"];

/**
 * Dva tábory — 100 little figures, each 1 % of the planet (weighted), coloured by option.
 * Pure: shares in, people out. Highlights the viewer's own option.
 */
export function TwoCamps({ question, options, highlight, total }: { question: string; options: CampOption[]; highlight?: string | null; total?: number }) {
  const t = useTranslations("common");
  const tp = useTranslations("planet");
  const figures = useMemo(() => {
    const out: number[] = [];
    const shares = options.map((o) => Math.max(0, o.share_weighted ?? 0));
    const sum = shares.reduce((s, v) => s + v, 0) || 1;
    let acc = 0;
    const cuts = shares.map((s) => (acc += (s / sum) * 100));
    for (let i = 0; i < 100; i++) {
      const idx = cuts.findIndex((c) => i + 0.5 < c);
      out.push(idx === -1 ? options.length - 1 : idx);
    }
    return out;
  }, [options]);

  return (
    <div className="card p-4 md:p-5">
      <p className="text-balance font-semibold">{question}</p>
      <div className="mt-3 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1 sm:gap-1.5" aria-hidden="true">
        {figures.map((idx, i) => (
          <motion.svg key={i} viewBox="0 0 10 20" className="h-4 w-full sm:h-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.004 }}>
            <circle cx="5" cy="4" r="3" fill={PALETTE[idx % PALETTE.length]} />
            <path d="M1 20v-7a4 4 0 0 1 8 0v7z" fill={PALETTE[idx % PALETTE.length]} opacity={highlight && options[idx]?.key !== highlight ? 0.55 : 1} />
          </motion.svg>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm">
        {options.map((o, i) => (
          <li key={o.key} className={`flex items-center justify-between gap-3 ${o.key === highlight ? "font-semibold" : ""}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
              <span aria-hidden="true">{o.icon}</span>
              <span className="truncate">{o.text}</span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular">
              <span className="text-text">{o.share_weighted == null ? "–" : `${o.share_weighted.toFixed(0)} %`}</span>
              <span className="text-faint"> · {t("raw")} {o.share_raw == null ? "–" : `${o.share_raw.toFixed(0)} %`}</span>
            </span>
          </li>
        ))}
      </ul>
      {total != null ? <p className="mt-2 text-xs text-faint">{tp("questionTotal", { count: total })}</p> : null}
    </div>
  );
}
