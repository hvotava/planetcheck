import { AXES, type AxisKey } from "@/types/domain";
import type { AxisMeans, RawWeighted } from "@/types/api";

/**
 * Country duel (ARCHITECTURE §15 phase 5). Pure: two countries' results in, one comparison out.
 * No I/O, no formatting, no locale — the page resolves texts and the component only draws.
 *
 * Agreement on a question is 100 − total variation distance between the two option
 * distributions: identical answers give 100, disjoint answers give 0. Reported raw and
 * weighted side by side (CLAUDE.md rule 5).
 */

export type DuelSideInput = {
  code: string;
  live_count: number;
  stats: {
    submissions_count: number;
    unlocked: boolean;
    survival_index: number | null;
    contradiction_index: number | null;
    realism_mean: number | null;
    axis_means: AxisMeans;
    top_archetype: string | null;
    titles: string[];
  } | null;
  questions: Array<{
    key: string;
    position: number;
    options: Array<{ key: string; icon: string | null; share_raw: number | null; share_weighted: number | null }>;
  }>;
};

export type DuelSideSummary = {
  code: string;
  votes: number;
  unlocked: boolean;
  survival: number | null;
  contradiction: number | null;
  realism: number | null;
  top_archetype: string | null;
  titles: string[];
};

export type DuelOptionRow = { key: string; icon: string | null; a: RawWeighted; b: RawWeighted; gap: RawWeighted };
export type DuelQuestionRow = {
  key: string;
  position: number;
  options: DuelOptionRow[];
  /** 0–100, higher = the two countries answered more alike */
  agreement: RawWeighted;
  /** option key each side put first, null when that side has no data */
  top_a: string | null;
  top_b: string | null;
  same_top: boolean;
};

export type DuelComparison = {
  a: DuelSideSummary;
  b: DuelSideSummary;
  axes: Array<{ axis: AxisKey; a: number | null; b: number | null; gap: number | null }>;
  questions: DuelQuestionRow[];
  /** the question the two countries disagree on most (lowest weighted agreement) */
  biggest: DuelQuestionRow | null;
  agreement: RawWeighted;
  /** false when either side has no votes at all — the page shows a progress bar instead */
  comparable: boolean;
};

function side(input: DuelSideInput): DuelSideSummary {
  const s = input.stats;
  return {
    code: input.code,
    votes: Math.max(s?.submissions_count ?? 0, input.live_count),
    unlocked: s?.unlocked ?? false,
    survival: s?.survival_index ?? null,
    contradiction: s?.contradiction_index ?? null,
    realism: s?.realism_mean ?? null,
    top_archetype: s?.top_archetype ?? null,
    titles: s?.titles ?? [],
  };
}

/** 100 − ½·Σ|aᵢ − bᵢ| over one question's options. null when either side has no distribution. */
export function shareAgreement(a: Array<number | null>, b: Array<number | null>): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  const sumA = a.reduce<number>((s, v) => s + (v ?? 0), 0);
  const sumB = b.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (sumA <= 0 || sumB <= 0) return null;
  let tv = 0;
  for (let i = 0; i < a.length; i++) tv += Math.abs(((a[i] ?? 0) / sumA) * 100 - ((b[i] ?? 0) / sumB) * 100);
  return Math.max(0, Math.min(100, 100 - tv / 2));
}

function topKey(options: Array<{ key: string; share_weighted: number | null; share_raw: number | null }>): string | null {
  let best: { key: string; v: number } | null = null;
  for (const o of options) {
    const v = o.share_weighted ?? o.share_raw;
    if (v == null) continue;
    if (!best || v > best.v) best = { key: o.key, v };
  }
  return best?.key ?? null;
}

function mean(values: Array<number | null>): number | null {
  const ok = values.filter((v): v is number => v != null && Number.isFinite(v));
  return ok.length === 0 ? null : ok.reduce((s, v) => s + v, 0) / ok.length;
}

/** Compares two countries over the questions they share. Order of `questions` follows side A. */
export function compareCountries(aIn: DuelSideInput, bIn: DuelSideInput): DuelComparison {
  const bByKey = new Map(bIn.questions.map((q) => [q.key, q] as const));
  const questions: DuelQuestionRow[] = [];

  for (const qa of [...aIn.questions].sort((x, y) => x.position - y.position)) {
    const qb = bByKey.get(qa.key);
    if (!qb) continue;
    const bOpt = new Map(qb.options.map((o) => [o.key, o] as const));
    const options: DuelOptionRow[] = qa.options.map((oa) => {
      const ob = bOpt.get(oa.key);
      const gapW = oa.share_weighted != null && ob?.share_weighted != null ? Math.abs(oa.share_weighted - ob.share_weighted) : null;
      const gapR = oa.share_raw != null && ob?.share_raw != null ? Math.abs(oa.share_raw - ob.share_raw) : null;
      return {
        key: oa.key,
        icon: oa.icon,
        a: { raw: oa.share_raw, weighted: oa.share_weighted },
        b: { raw: ob?.share_raw ?? null, weighted: ob?.share_weighted ?? null },
        gap: { raw: gapR, weighted: gapW },
      };
    });
    questions.push({
      key: qa.key,
      position: qa.position,
      options,
      agreement: {
        weighted: shareAgreement(options.map((o) => o.a.weighted), options.map((o) => o.b.weighted)),
        raw: shareAgreement(options.map((o) => o.a.raw), options.map((o) => o.b.raw)),
      },
      top_a: topKey(qa.options),
      top_b: topKey(qb.options),
      same_top: topKey(qa.options) != null && topKey(qa.options) === topKey(qb.options),
    });
  }

  const scored = questions.filter((q) => q.agreement.weighted != null);
  const biggest = scored.length ? scored.reduce((lo, q) => (q.agreement.weighted! < lo.agreement.weighted! ? q : lo)) : null;

  const a = side(aIn);
  const b = side(bIn);
  return {
    a,
    b,
    axes: AXES.map((axis) => {
      const av = aIn.stats?.axis_means?.weighted?.[axis] ?? null;
      const bv = bIn.stats?.axis_means?.weighted?.[axis] ?? null;
      return { axis, a: av, b: bv, gap: av != null && bv != null ? Math.abs(av - bv) : null };
    }),
    questions,
    biggest,
    agreement: {
      weighted: mean(questions.map((q) => q.agreement.weighted)),
      raw: mean(questions.map((q) => q.agreement.raw)),
    },
    comparable: a.votes > 0 && b.votes > 0 && scored.length > 0,
  };
}
