import type { ArchetypeRule, ChoiceAnswer, MetaGuess, ScoringRound, SubmissionScore } from "@/types/domain";
import { scoreAxes } from "./axes";
import { scoreRealism } from "./realism";
import { findContradictions, scoreConsistency } from "./contradiction";
import { honeypotHit, scoreCompromise } from "./compromise";
import { scoreSurvival } from "./survival";
import { assignArchetype } from "./archetype";

export { scoreAxes, scoreRealism, findContradictions, scoreConsistency, scoreCompromise, honeypotHit, scoreSurvival, assignArchetype };

export type ScoringInput = {
  answers: ChoiceAnswer[];
  metaGuesses: MetaGuess[];
  round: ScoringRound;
};

/** Full scoring of one submission. Pure: answers + content in, numbers out. ARCHITECTURE §8. */
export function scoreSubmission(input: ScoringInput, rules: ArchetypeRule[]): SubmissionScore {
  const { answers, metaGuesses, round } = input;
  const axes = scoreAxes(answers, round);
  const realism = scoreRealism(metaGuesses);
  const contradictions_hit = findContradictions(answers, round);
  const consistency = scoreConsistency(contradictions_hit.length, round.contradictions.length);
  const compromise = scoreCompromise(answers, round);
  const survival = scoreSurvival({ consistency, compromise, realism }, round.survival_weights);
  const archetype = assignArchetype({ axes, realism, consistency, compromise, survival }, rules);
  return {
    axes,
    realism,
    consistency,
    compromise,
    survival,
    archetype,
    contradictions_hit,
    honeypot_hit: honeypotHit(answers, round),
  };
}

/** Round to 4 decimals for storage/display without floating-point noise. */
export function round4(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10000) / 10000;
}
