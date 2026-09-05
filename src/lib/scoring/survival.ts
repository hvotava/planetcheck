import type { SurvivalWeights } from "@/types/domain";

/**
 * Survival = w_c·consistency + w_k·compromise + w_r·realism (weights from the round's content).
 * When realism is unavailable (null), the remaining weights are renormalised to sum to 1.
 * Pure. ARCHITECTURE §8.
 */
export function scoreSurvival(
  parts: { consistency: number; compromise: number; realism: number | null },
  weights: SurvivalWeights,
): number {
  const terms: Array<[number, number]> = [
    [weights.consistency, parts.consistency],
    [weights.compromise, parts.compromise],
  ];
  if (parts.realism != null) terms.push([weights.realism, parts.realism]);
  const wsum = terms.reduce((s, [w]) => s + w, 0);
  if (wsum <= 0) return 0;
  const v = terms.reduce((s, [w, x]) => s + w * x, 0) / wsum;
  return Math.min(1, Math.max(0, v));
}
