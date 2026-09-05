import { randomUUID, createHash } from "node:crypto";
import { createPgliteExecutor } from "@/lib/db/pglite";
import { runMigrations } from "@/lib/db/migrate";
import { Repo, type SubmitVoteInput } from "@/lib/db/repo";
import { syncContent } from "@/lib/content/sync";
import { archetypeRules, loadArchetypes } from "@/lib/content/loader";
import { scoreSubmission } from "@/lib/scoring";
import { toScoringRound } from "@/lib/seed/synthetic";
import type { RoundPayload } from "@/types/api";
import type { AgeBand, Gender, Settlement } from "@/types/domain";

export async function createTestRepo() {
  const db = await createPgliteExecutor();
  await runMigrations(db);
  const repo = new Repo(db);
  await syncContent(repo, { log: () => undefined });
  const round = (await repo.getRound({ slug: "2026-w37" }))!;
  const anchor = (await repo.getRound({ slug: "anchor" }))!;
  return { db, repo, round, anchor, close: () => db.close() };
}

export type VoteOpts = {
  anon?: string;
  ip?: string;
  country?: string | null;
  meta?: Record<string, { guess: number; actual: number | null }>;
  age_band?: AgeBand | null;
  gender?: Gender | null;
  settlement?: Settlement | null;
  flags?: string[];
  submitted_at?: string;
  locale?: string;
  declared_country?: string | null;
};

/** Builds a full submit_vote payload from option keys, running the real scoring. */
export function buildVote(round: RoundPayload, choices: Record<string, string>, opts: VoteOpts = {}): SubmitVoteInput {
  const scoring = toScoringRound(round);
  const rules = archetypeRules(loadArchetypes());
  const answers = round.questions
    .filter((q) => q.type === "choice")
    .map((q) => {
      const optKey = choices[q.key];
      if (!optKey) throw new Error(`no choice for ${q.key}`);
      const o = q.options.find((x) => x.key === optKey);
      if (!o) throw new Error(`unknown option ${q.key}.${optKey}`);
      return { question_id: q.id, option_id: o.id, question: q.key, option: o.key };
    });
  const metas = round.questions
    .filter((q) => q.type === "meta")
    .map((q) => {
      const m = opts.meta?.[q.key] ?? { guess: 50, actual: null };
      return { question_id: q.id, guess: m.guess, actual_at_submit: m.actual, question: q.key };
    });
  const score = scoreSubmission(
    {
      answers: answers.map((a) => ({ question: a.question, option: a.option })),
      metaGuesses: metas.map((m) => ({ question: m.question, guess: m.guess, actual: m.actual_at_submit })),
      round: scoring,
    },
    rules,
  );
  const flags = [...(opts.flags ?? [])];
  if (score.honeypot_hit && !flags.includes("honeypot")) flags.push("honeypot");
  return {
    round_id: round.id,
    anon_id: opts.anon ?? randomUUID(),
    ip_hash: createHash("sha256").update(opts.ip ?? randomUUID()).digest("hex"),
    ua_family: "test",
    locale: opts.locale ?? "cs",
    geo_country: opts.country === undefined ? "CZ" : opts.country,
    declared_country: opts.declared_country ?? null,
    country: opts.country === undefined ? "CZ" : opts.country,
    age_band: opts.age_band ?? null,
    gender: opts.gender ?? null,
    settlement: opts.settlement ?? null,
    loaded_at: new Date(Date.now() - 60_000).toISOString(),
    submitted_at: opts.submitted_at,
    answers: answers.map(({ question_id, option_id }) => ({ question_id, option_id })),
    meta_guesses: metas.map(({ question_id, guess, actual_at_submit }) => ({ question_id, guess, actual_at_submit })),
    score,
    flags,
  };
}

export const DOVE: Record<string, string> = {
  neighbor_field: "un",
  stranger_at_door: "let_in",
  bigger_stick: "treaty",
  the_bridge: "together",
  the_harvest: "trade_water",
  secret_weapon: "promise",
  the_referee: "court",
};

export const HAWK: Record<string, string> = {
  neighbor_field: "cousin",
  stranger_at_door: "no_open",
  bigger_stick: "bigger",
  the_bridge: "no_bridge",
  the_harvest: "take",
  secret_weapon: "buy",
  the_referee: "boats",
};

export const TORN: Record<string, string> = {
  neighbor_field: "un", // + the_harvest.take → contradiction, + the_referee.boats → contradiction
  stranger_at_door: "let_in", // + the_bridge.no_bridge → contradiction
  bigger_stick: "treaty", // + secret_weapon.buy → contradiction
  the_bridge: "no_bridge",
  the_harvest: "take",
  secret_weapon: "buy",
  the_referee: "boats",
};

export const MOON: Record<string, string> = { ...DOVE, neighbor_field: "moon" };
