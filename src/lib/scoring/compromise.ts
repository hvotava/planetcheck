import type { ChoiceAnswer, ScoringRound } from "@/types/domain";

/** Compromise = share of chosen options flagged `compromise: true` among answered choice questions. Pure. */
export function scoreCompromise(answers: ChoiceAnswer[], round: ScoringRound): number {
  const byQuestion = new Map(round.questions.map((q) => [q.key, q] as const));
  let answered = 0;
  let compromise = 0;
  for (const a of answers) {
    const q = byQuestion.get(a.question);
    if (!q || q.type !== "choice") continue;
    const o = q.options.find((x) => x.key === a.option);
    if (!o) continue;
    answered++;
    if (o.compromise) compromise++;
  }
  return answered === 0 ? 0 : compromise / answered;
}

/** True when any chosen option is a honeypot (nonsense answer). Flag, never block. */
export function honeypotHit(answers: ChoiceAnswer[], round: ScoringRound): boolean {
  const byQuestion = new Map(round.questions.map((q) => [q.key, q] as const));
  return answers.some((a) => byQuestion.get(a.question)?.options.find((o) => o.key === a.option)?.honeypot === true);
}
