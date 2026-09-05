import type { ChoiceAnswer, ScoringRound } from "@/types/domain";

/** Keys of contradiction pairs the player activated (chose both tense options). Pure. */
export function findContradictions(answers: ChoiceAnswer[], round: ScoringRound): string[] {
  const chosen = new Set(answers.map((a) => `${a.question}::${a.option}`));
  return round.contradictions
    .filter((p) => chosen.has(`${p.a.question}::${p.a.option}`) && chosen.has(`${p.b.question}::${p.b.option}`))
    .map((p) => p.key);
}

/** Consistency = 1 − activated pairs / pairs in round. No pairs → 1. Pure. ARCHITECTURE §8. */
export function scoreConsistency(hits: number, pairsInRound: number): number {
  if (pairsInRound <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - hits / pairsInRound));
}
