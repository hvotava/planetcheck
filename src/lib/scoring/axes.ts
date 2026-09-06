import { AXES, type AxisKey, type AxisScores, type AxisWeights, type ChoiceAnswer, type ScoringRound } from "@/types/domain";

/**
 * Axis score = sum of axis_weights of the chosen options / maximum possible absolute sum
 * in the round (per axis), clamped to −1..+1. Pure. ARCHITECTURE §8.
 */
export function scoreAxes(answers: ChoiceAnswer[], round: ScoringRound): AxisScores {
  return scoreAxesOver(
    answers,
    round.questions.filter((q) => q.type === "choice"),
  );
}

/** A question the axis normalisation can work on: a key and options carrying axis weights. */
export type AxisScorable = { key: string; options: ReadonlyArray<{ key: string; axis_weights: AxisWeights }> };

/**
 * The normalisation itself, shared by rounds and by the Kompas profile: sum of the chosen
 * weights divided by the largest absolute sum the question set could produce, per axis.
 * Questions the caller did not pass in simply do not contribute to either side of the ratio.
 */
export function scoreAxesOver(answers: ChoiceAnswer[], questions: ReadonlyArray<AxisScorable>): AxisScores {
  const sums: Record<AxisKey, number> = { peace_force: 0, trust_paranoia: 0, us_them: 0 };
  const maxAbs: Record<AxisKey, number> = { peace_force: 0, trust_paranoia: 0, us_them: 0 };
  const byQuestion = new Map(questions.map((q) => [q.key, q] as const));

  for (const q of questions) {
    for (const axis of AXES) {
      let m = 0;
      for (const o of q.options) m = Math.max(m, Math.abs(o.axis_weights[axis] ?? 0));
      maxAbs[axis] += m;
    }
  }

  for (const a of answers) {
    const q = byQuestion.get(a.question);
    if (!q) continue;
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
