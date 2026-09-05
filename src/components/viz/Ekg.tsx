"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useId, useMemo } from "react";

export type EkgProps = {
  /** votes per minute, oldest → newest */
  points: number[];
  perMin: number;
  votesTotal: number;
  survival: { raw: number | null; weighted: number | null };
  live?: boolean;
  compact?: boolean;
  /** flash round: extra beep marker at the newest point */
  flash?: boolean;
};

/**
 * EKG planety — the planet's pulse (votes per minute). Pure: numbers in, SVG out.
 * The line is drawn with a monitor-style sweep; the newest point pulses when live.
 */
export function Ekg({ points, perMin, votesTotal, survival, live = false, compact = false, flash = false }: EkgProps) {
  const t = useTranslations("common");
  const tp = useTranslations("planet");
  const tl = useTranslations("landing");
  const id = useId();
  const W = 600;
  const H = compact ? 120 : 180;
  const pad = 8;

  const { d, last, max } = useMemo(() => {
    const pts = points.length ? points : [0];
    const max = Math.max(3, ...pts);
    const n = pts.length;
    const step = n > 1 ? (W - pad * 2) / (n - 1) : 0;
    const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
    // EKG look: each point becomes a spike; baseline between spikes
    let d = `M ${pad} ${y(pts[0]!)}`;
    for (let i = 1; i < n; i++) {
      const x = pad + i * step;
      const v = pts[i]!;
      const px = pad + (i - 1) * step;
      const base = y(Math.min(v, pts[i - 1]!) * 0.25);
      d += ` L ${px + step * 0.35} ${base} L ${px + step * 0.55} ${y(v)} L ${px + step * 0.75} ${base} L ${x} ${y(v * 0.3)}`;
    }
    return { d, last: { x: pad + (n - 1) * step, y: y(pts[n - 1]! * 0.3) }, max };
  }, [points, H]);

  return (
    <div className={`card relative overflow-hidden ${compact ? "p-3" : "p-4 md:p-6"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            {tp("ekgTitle")}
            {live ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" /> {t("live")}
              </span>
            ) : null}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular">
            {t("votesPerMin", { count: perMin })} <span className="text-sm font-normal text-muted">· {t("votes", { count: votesTotal })}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted">{tl("survivalIndex")}</p>
          <p className="font-display text-2xl font-bold tabular text-accent">
            {survival.weighted == null ? "–" : `${survival.weighted.toFixed(0)} %`}
            <span className="ml-2 text-xs font-normal text-muted">
              {t("raw")}: {survival.raw == null ? "–" : `${survival.raw.toFixed(0)} %`}
            </span>
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={tp("ekgHint")}>
        <defs>
          <linearGradient id={`${id}-fade`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.05" />
            <stop offset="0.7" stopColor="var(--color-accent)" stopOpacity="0.6" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="1" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H - pad - f * (H - pad * 2)} y2={H - pad - f * (H - pad * 2)} stroke="var(--color-border)" strokeDasharray="2 6" />
        ))}
        <text x={W - pad} y={pad + 10} textAnchor="end" className="fill-[var(--color-faint)] font-mono" fontSize="10">
          max {max}/min
        </text>
        <motion.path d={d} fill="none" stroke={`url(#${id}-fade)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" filter={`url(#${id}-glow)`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeOut" }} />
        {live ? (
          <>
            <motion.circle cx={last.x} cy={last.y} r={5} fill="var(--color-accent)" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: [1, 0.35, 1], scale: [1, 1.8, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ transformOrigin: `${last.x}px ${last.y}px`, transformBox: "view-box" }} />
            <circle cx={last.x} cy={last.y} r="2.5" fill="#fff" />
          </>
        ) : null}
        {flash ? <text x={last.x - 4} y={Math.max(14, last.y - 12)} fontSize="12" className="fill-[var(--color-warm)] font-mono">⚡</text> : null}
      </svg>
    </div>
  );
}
