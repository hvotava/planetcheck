import type { ContentRound, SubmissionScore, Demographics, TrustLevel } from "@/types/domain";
import type {
  CountryAggregate,
  CountryBoard,
  CountryResults,
  CountryStatsRow,
  MetaActual,
  NarratorPost,
  PlanetResults,
  PlanetStatsRow,
  PulseSeries,
  QuestionShares,
  ResultsFilterPayload,
  RoundPayload,
  SubmissionPayload,
  SubmitVoteResult,
  VoterStatus,
} from "@/types/api";
import type { DbExecutor, Json } from "./executor";

export type SubmitVoteInput = {
  round_id: string;
  anon_id: string;
  ip_hash: string;
  ua_family?: string | null;
  locale: string;
  geo_country?: string | null;
  declared_country?: string | null;
  country?: string | null;
  loaded_at?: string | null;
  submitted_at?: string;
  answers: Array<{ question_id: string; option_id: string }>;
  meta_guesses: Array<{ question_id: string; guess: number; actual_at_submit: number | null }>;
  score: SubmissionScore;
  flags: string[];
  rate_ip_per_hour?: number;
  rate_anon_per_hour?: number;
  skip_rate?: boolean;
  synthetic?: boolean;
} & Pick<Demographics, "age_band" | "gender" | "settlement">;

export type CountrySyncRow = { code: string; name_en: string; region: string | null; population: number; demographics: Json; source?: string };

/** Typed façade over the SQL API. One method per function; no SQL in the application layer. */
export class Repo {
  constructor(public readonly db: DbExecutor) {}

  // --- content
  syncCountries(rows: CountrySyncRow[]) {
    return this.db.rpc<{ count: number }>("sync_countries", rows as unknown as Json);
  }
  syncRound(round: ContentRound) {
    return this.db.rpc<{ round_id: string; slug: string; questions: number; options: number; contradictions: number }>("sync_round", round as unknown as Json);
  }

  // --- rounds
  getRound(args: { id?: string; slug?: string; kind?: string; fallback_anchor?: boolean } = {}) {
    return this.db.rpc<RoundPayload | null>("get_round", args);
  }
  listRounds(includeDraft = false) {
    return this.db.rpc<Array<{ id: string; slug: string; kind: string; status: string; starts_at: string; ends_at: string | null; i18n: Record<string, { title: string; blurb?: string }>; unlock_threshold: number; votes_total: number }>>("list_rounds", { include_draft: includeDraft });
  }
  voterStatus(roundId: string, anonId: string) {
    return this.db.rpc<VoterStatus>("voter_status", { round_id: roundId, anon_id: anonId });
  }

  // --- live shares
  questionShares(questionId: string, country?: string | null) {
    return this.db.rpc<QuestionShares>("question_shares", { question_id: questionId, country: country ?? null });
  }
  metaActuals(roundId: string) {
    return this.db.rpc<MetaActual[]>("meta_actuals", { round_id: roundId });
  }

  // --- vote
  submitVote(input: SubmitVoteInput) {
    return this.db.rpc<SubmitVoteResult>("submit_vote", input as unknown as Json);
  }
  seedSubmissions(rows: SubmitVoteInput[]) {
    return this.db.rpc<{ inserted: number; duplicates: number }>("seed_submissions", { rows: rows as unknown as Json });
  }
  getSubmission(id: string) {
    return this.db.rpc<SubmissionPayload | null>("get_submission", { submission_id: id });
  }

  // --- results
  planetResults(roundId: string, filter?: ResultsFilterPayload) {
    return this.db.rpc<PlanetResults>("planet_results", { round_id: roundId, filter: (filter ?? {}) as Json });
  }
  pulseSeries(roundId: string, minutes = 60) {
    return this.db.rpc<PulseSeries>("pulse_series", { round_id: roundId, minutes });
  }
  refreshPlanetPulse(roundId: string, force = false) {
    return this.db.rpc<PlanetStatsRow>("refresh_planet_pulse", { round_id: roundId, force });
  }
  planetSnapshotSeries(roundId: string, limit = 288) {
    return this.db.rpc<Array<{ at: string; votes_total: number; survival_raw: number | null; survival_weighted: number | null; contradiction_weighted: number | null; pulse_per_min: number }>>("planet_snapshot_series", { round_id: roundId, limit });
  }
  questionTrend(questionKey: string) {
    return this.db.rpc<Array<{ round_id: string; slug: string; kind: string; starts_at: string; total_raw: number; options: Array<{ key: string; raw: number; weighted: number; share_weighted: number | null }> }>>("question_trend", { question_key: questionKey });
  }

  // --- recompute
  submissionCells(roundId: string) {
    return this.db.rpc<Array<{ country: string | null; age_band: string | null; gender: string | null; n: number }>>("submission_cells", { round_id: roundId });
  }
  applyCellWeights(roundId: string, cells: Array<{ country: string | null; age_band: string | null; gender: string | null; weight: number }>) {
    return this.db.rpc<{ updated: number }>("apply_cell_weights", { round_id: roundId, cells: cells as unknown as Json });
  }
  countryAggregates(roundId: string) {
    return this.db.rpc<CountryAggregate[]>("country_aggregates", { round_id: roundId });
  }
  upsertCountryStats(roundId: string, rows: CountryStatsRow[]) {
    return this.db.rpc<{ count: number }>("upsert_country_stats", { round_id: roundId, rows: rows as unknown as Json });
  }
  recomputePlanetStats(roundId: string) {
    return this.db.rpc<PlanetStatsRow>("recompute_planet_stats", { round_id: roundId });
  }
  finalizeMetaActuals(roundId: string) {
    return this.db.rpc<{ updated: number }>("finalize_meta_actuals", { round_id: roundId });
  }

  // --- countries
  countryBoard(roundId: string) {
    return this.db.rpc<CountryBoard>("country_board", { round_id: roundId });
  }
  countryResults(roundId: string, code: string) {
    return this.db.rpc<CountryResults>("country_results", { round_id: roundId, country_code: code });
  }

  // --- narrator
  narratorContext(roundId: string) {
    return this.db.rpc<Json>("narrator_context", { round_id: roundId });
  }
  insertNarratorPost(input: { round_id: string; locale: string; body: string; model: string; context: Json }) {
    return this.db.rpc<{ id: string; approved: false }>("insert_narrator_post", input);
  }
  setNarratorApproval(id: string, approved: boolean) {
    return this.db.rpc<NarratorPost | null>("set_narrator_approval", { id, approved });
  }
  narratorPosts(args: { locale?: string; only_approved?: boolean; limit?: number } = {}) {
    return this.db.rpc<NarratorPost[]>("narrator_posts", args);
  }

  // --- export
  exportRound(roundId: string, minCountry?: number) {
    return this.db.rpc<Json>("export_round", { round_id: roundId, min_country: minCountry ?? null });
  }

  // --- verified layer
  linkAuthUser(input: { anon_id: string; provider: string; subject_hash: string; session_ttl_seconds?: number }) {
    return this.db.rpc<{ auth_user_id: string; voter_id: string; trust: TrustLevel; upgraded: number; conflicts: number; session_id: string }>("link_auth_user", input);
  }
  authSession(sessionId: string) {
    return this.db.rpc<{ valid: boolean; voter_id?: string; auth_user_id?: string; expires_at?: string }>("auth_session", { session_id: sessionId });
  }

  // --- jobs
  acquireJobLease(name: string, seconds: number) {
    return this.db.rpc<{ acquired: boolean }>("acquire_job_lease", { name, seconds });
  }
  releaseJobLease(name: string, status: string, error?: string) {
    return this.db.rpc<{ released: boolean }>("release_job_lease", { name, status, error: error ?? null });
  }

  health() {
    return this.db.rpc<{ ok: boolean; now: string; rounds: number; live_round: string | null; submissions: number; countries: number }>("db_health", {});
  }
}
