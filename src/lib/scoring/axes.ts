import { AXES, type AxisKey, type AxisScores, type ChoiceAnswer, type ScoringRound } from "@/types/domain";

/**
 * Axis score = sum of axis_weights of the chosen options / maximum possible absolute sum
 * in the round (per axis), clamped to −1..+1. Pure. ARCHITECTURE §8.
 */
export function scoreAxes(answers: ChoiceAnswer[], round: ScoringRound): AxisScores {
  const sums: Record<AxisKey, number> = { peace_force: 0, trust_paranoia: 0, us_them: 0 };
  const maxAbs: Record<AxisKey, number> = { peace_force: 0, trust_paranoia: 0, us_them: 0 };
  const byQuestion = new Map(round.questions.map((q) => [q.key, q] as const));

  for (const q of round.questions) {
    if (q.type !== "choice") continue;
    for (const axis of AXES) {
      let m = 0;
      for (const o of q.options) m = Math.max(m, Math.abs(o.axis_weights[axis] ?? 0));
      maxAbs[axis] += m;
    }
  }

  for (const a of answers) {
    const q = byQuestion.get(a.question);
    if (!q || q.type !== "choice") continue;
    const o = q.options.find((x) => x.key === a.option);
    if (!o) continue;
    for (const axis of AXES) sums[axis] += o.axis_weights[axis] ?? 0;
  }

  const out = {} as AxisScores;
  for (const axis of AXES) {
    out[axis] = maxAbs[axis] === 0 ? 0 : clamp(sums[axis] / maxAbs[axis], -1, 1);
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
