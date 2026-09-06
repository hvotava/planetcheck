import { scoreAxesOver } from "@/lib/scoring/axes";
import {
  COMPASS_BIASES,
  type AxisScores,
  type CompassAnswer,
  type CompassBias,
  type CompassScore,
  type ScoringCompassDeck,
  type ScoringCompassQuestion,
} from "@/types/domain";

/**
 * Kompas scoring (ARCHITECTURE §17). Pure: answers plus the deck in, numbers out.
 *
 * The facts are scored against a correct answer; the values and trust sections are not
 * scored at all, they only move the three axes. Keeping both in one function means a
 * submission is one object, the same way a round submission is.
 */

/** What random clicking scores on the facts the player actually answered. */
export function chanceBaseline(deck: ScoringCompassDeck, answeredKeys?: Iterable<string>): number | null {
  const answered = answeredKeys ? new Set(answeredKeys) : null;
  const facts = deck.questions.filter((q) => q.section === "fact" && q.options.length > 0 && (!answered || answered.has(q.key)));
  if (facts.length === 0) return null;
  return facts.reduce((s, q) => s + 1 / q.options.length, 0) / facts.length;
}

/**
 * How much better than random the player did, on a scale where 0 is "no better than
 * clicking blindly" and 1 is "everything right". Negative means worse than random, which
 * is Rosling's whole point and is only expressible because every fact has three options.
 */
export function skillOverChance(knowledge: number | null, chance: number | null): number | null {
  if (knowledge == null || chance == null) return null;
  if (chance >= 1) return null;
  return (knowledge - chance) / (1 - chance);
}

/** The three axes from the values and trust sections. Facts never carry axis weights. */
export function scoreCompassAxes(answers: CompassAnswer[], deck: ScoringCompassDeck): AxisScores {
  return scoreAxesOver(
    answers,
    deck.questions.filter((q) => q.section !== "fact"),
  );
}

/** Full score of one Kompas submission. */
export function scoreCompass(answers: CompassAnswer[], deck: ScoringCompassDeck): CompassScore {
  const byKey = new Map<string, ScoringCompassQuestion>(deck.questions.map((q) => [q.key, q] as const));
  const seen = new Set<string>();
  const bias = Object.fromEntries(COMPASS_BIASES.map((b) => [b, 0])) as Record<CompassBias, number>;
  const correct_keys: string[] = [];
  let facts_total = 0;
  let facts_correct = 0;

  for (const a of answers) {
    const q = byKey.get(a.question);
    if (!q || q.section !== "fact") continue;
    // One answer per question; a repeated key is ignored rather than counted twice.
    if (seen.has(q.key)) continue;
    const o = q.options.find((x) => x.key === a.option);
    if (!o) continue;
    seen.add(q.key);
    facts_total++;
    if (o.correct) {
      facts_correct++;
      correct_keys.push(q.key);
    } else if (o.bias) {
      bias[o.bias]++;
    }
  }

  const knowledge = facts_total === 0 ? null : facts_correct / facts_total;
  const chance = chanceBaseline(deck, seen);
  return {
    facts_total,
    facts_correct,
    knowledge,
    chance,
    skill: skillOverChance(knowledge, chance),
    bias,
    axes: scoreCompassAxes(answers, deck),
    correct_keys,
  };
}

/** Round to 4 decimals for storage and display without floating-point noise. */
export function round4(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10000) / 10000;
}
