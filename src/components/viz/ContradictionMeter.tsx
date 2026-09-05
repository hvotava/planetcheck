"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export type PairShare = { key: string; title: string; blurb?: string; share_weighted: number | null; share_raw: number | null };

/** Rozporoměr — gauge of the share of people who chose both sides of a tense pair, plus the pairs ranked. */
export function ContradictionMeter({ value, pairs }: { value: { raw: number | null; weighted: number | null }; pairs: PairShare[] }) {
  const t = useTranslations("planet");
  const tc = useTranslations("common");
  const w = value.weighted ?? 0;
  const r = value.raw ?? 0;
  const angle = (v: number) => -90 + (Math.max(0, Math.min(100, v)) / 100) * 180;
  const R = 90;
  const cx = 110;
  const cy = 105;
  const arc = (from: number, to: number) => {
    const a1 = ((from - 90) * Math.PI) / 180;
    const a2 = ((to - 90) * Math.PI) / 180;
    const x1 = cx + R * Math.cos(a1 - Math.PI / 2);
    const y1 = cy + R * Math.sin(a1 - Math.PI / 2);
    const x2 = cx + R * Math.cos(a2 - Math.PI / 2);
    const y2 = cy + R * Math.sin(a2 - Math.PI / 2);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  return (
    <div className="card p-4 md:p-5">
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
        <svg viewBox="0 0 220 120" className="w-56 shrink-0" role="img" aria-label={t("contradictionValue", { pct: Math.round(w) })}>
          <path d={arc(0, 180)} fill="none" stroke="var(--color-surface-3)" strokeWidth="14" strokeLinecap="round" />
          <path d={arc(0, 60)} fill="none" stroke="var(--color-accent)" strokeWidth="14" strokeLinecap="round" opacity="0.5" />
          <path d={arc(60, 120)} fill="none" stroke="var(--color-warm)" strokeWidth="14" opacity="0.5" />
          <path d={arc(120, 180)} fill="none" stroke="var(--color-danger)" strokeWidth="14" strokeLinecap="round" opacity="0.5" />
          <motion.g initial={{ rotate: -90 }} animate={{ rotate: angle(w) }} transition={{ type: "spring", stiffness: 60, damping: 14 }} style={{ originX: `${cx}px`, originY: `${cy}px` }}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - R + 6} stroke="var(--color-text)" strokeWidth="3" strokeLinecap="round" />
          </motion.g>
          <g transform={`rotate(${angle(r)} ${cx} ${cy})`}>
            <line x1={cx} y1={cy - R - 10} x2={cx} y2={cy - R - 2} stroke="var(--color-muted)" strokeWidth="2" />
          </g>
          <circle cx={cx} cy={cy} r="6" fill="var(--color-text)" />
          <text x={cx} y={cy - 24} textAnchor="middle" className="fill-[var(--color-text)] font-display" fontSize="26" fontWeight="700">
            {Math.round(w)} %
          </text>
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-[var(--color-muted)] font-mono" fontSize="10">
            {tc("raw")} {Math.round(r)} %
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("contradictionValue", { pct: Math.round(w) })}</p>
          <ul className="mt-3 space-y-2">
            {pairs.map((p) => (
              <li key={p.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate" title={p.blurb}>
                    {p.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular">
                    {p.share_weighted == null ? "–" : `${p.share_weighted.toFixed(0)} %`}
                    <span className="text-faint"> · {p.share_raw == null ? "–" : `${p.share_raw.toFixed(0)} %`}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full bg-warm" initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.share_weighted ?? 0)}%` }} transition={{ duration: 0.8 }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
