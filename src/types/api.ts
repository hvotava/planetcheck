/**
 * Shapes returned by the SQL API (db/migrations/0003_api_functions.sql) and by /api/* routes.
 * Numbers inside jsonb arrive as JS numbers; timestamps as ISO strings.
 */
import type { AgeBand, AxisKey, Gender, I18nMap, LocalizedLabel, LocalizedOption, LocalizedQuestion, QuestionType, RoundKind, RoundStatus, Settlement, SurvivalWeights, TrustLevel } from "./domain";

export type RawWeighted = { raw: number | null; weighted: number | null };

export type RoundOptionPayload = {
  id: string;
  key: string;
  position: number;
  i18n: I18nMap<LocalizedOption>;
  icon: string | null;
  axis_weights: Partial<Record<AxisKey, number>>;
  compromise: boolean;
  honeypot: boolean;
};

export type RoundQuestionPayload = {
  id: string;
  key: string;
  type: QuestionType;
  position: number;
  i18n: I18nMap<LocalizedQuestion>;
  review_required: boolean;
  anchor: boolean;
  target: { question_id: string; option_id: string; question_key: string; option_key: string } | null;
  options: RoundOptionPayload[];
};

export type RoundContradictionPayload = {
  id: string;
  key: string;
  i18n: I18nMap<LocalizedLabel>;
  a: { question_id: string; option_id: string; question_key: string; option_key: string };
  b: { question_id: string; option_id: string; question_key: string; option_key: string };
};

export type RoundPayload = {
  id: string;
  slug: string;
  kind: RoundKind;
  status: RoundStatus;
  starts_at: string;
  ends_at: string | null;
  unlock_threshold: number;
  survival_weights: SurvivalWeights;
  i18n: I18nMap<LocalizedLabel>;
  questions: RoundQuestionPayload[];
  contradictions: RoundContradictionPayload[];
};

/** What the browser receives for /play: localized, without scoring internals. */
export type PlayOption = { id: string; key: string; text: string; icon: string | null };
export type PlayQuestion = {
  id: string;
  key: string;
  type: QuestionType;
  position: number;
  text: string;
  scenario: string | null;
  fallback_locale: string | null;
  anchor: boolean;
  options: PlayOption[];
  target: { question_id: string; option_id: string } | null;
};
export type PlayRound = {
  id: string;
  slug: string;
  kind: RoundKind;
  title: string;
  blurb: string | null;
  ends_at: string | null;
  questions: PlayQuestion[];
  loaded_at: string;
  turnstile_site_key: string | null;
  already_voted: { submission_id: string } | null;
  countries: Array<{ code: string; name: string; flag: string }>;
  geo_country: string | null;
};

export type OptionShare = { option_id: string; key: string; raw: number; weighted: number; share_raw: number | null; share_weighted: number | null };
export type QuestionShares = {
  question_id: string;
  total_raw: number;
  total_weighted: number;
  options: OptionShare[];
  country: { code: string; total_raw: number; options: OptionShare[] } | null;
};

export type MetaActual = {
  question_id: string;
  question_key: string;
  target_question_id: string;
  target_option_id: string;
  actual_weighted: number | null;
  actual_raw: number | null;
};

export type SubmitVoteResult =
  | { ok: true; submission_id: string; flags: string[]; trust: TrustLevel; country: string | null }
  | { ok: false; code: "duplicate"; submission_id: string };

export type SubmissionPayload = {
  id: string;
  round: { id: string; slug: string; kind: RoundKind; status: RoundStatus; i18n: I18nMap<LocalizedLabel>; survival_weights: SurvivalWeights; unlock_threshold: number; ends_at: string | null };
  country_code: string | null;
  trust: TrustLevel;
  locale: string;
  axis_scores: Record<AxisKey, number>;
  realism: number | null;
  consistency: number;
  compromise: number;
  survival: number;
  archetype: string;
  contradictions_hit: string[];
  submitted_at: string;
  answers: Array<{ question_id: string; question_key: string; option_id: string; option_key: string }>;
  meta_guesses: Array<{ question_id: string; question_key: string; guess: number; actual_at_submit: number | null; actual_final: number | null; actual_now: number | null }>;
  planet: { votes_total: number; survival_raw: number | null; survival_weighted: number | null; contradiction_weighted: number | null; archetype_shares: ArchetypeShares; axis_means: AxisMeans } | null;
  country: { code: string; name_en: string; submissions_count: number; unlocked: boolean; survival_index: number | null; rank: number | null; titles: string[]; top_archetype: string | null; axis_means: AxisMeans } | null;
};

export type AxisMeans = { raw?: Record<AxisKey, number | null>; weighted?: Record<AxisKey, number | null> };
export type ShareEntry = { raw: number; weighted: number; share_raw: number | null; share_weighted: number | null };
export type ArchetypeShares = Record<string, ShareEntry>;

export type PlanetResults = {
  round_id: string;
  filtered: boolean;
  filter: ResultsFilterPayload;
  computed_at: string;
  totals: { raw: number; weighted: number; verified: number };
  survival: RawWeighted;
  contradiction: RawWeighted;
  realism: RawWeighted;
  compromise: RawWeighted;
  consistency: RawWeighted;
  axis_means: AxisMeans;
  archetypes: ArchetypeShares;
  questions: Array<{
    question_id: string;
    key: string;
    position: number;
    i18n: I18nMap<LocalizedQuestion>;
    anchor: boolean;
    total_raw: number;
    total_weighted: number;
    options: Array<OptionShare & { icon: string | null; i18n: I18nMap<LocalizedOption>; compromise: boolean }>;
  }>;
  pairs: Array<{ key: string; i18n: I18nMap<LocalizedLabel>; raw: number; weighted: number; share_raw: number | null; share_weighted: number | null }>;
};

export type ResultsFilterPayload = {
  trust?: TrustLevel;
  age_band?: AgeBand;
  gender?: Gender;
  settlement?: Settlement;
  country?: string;
};

export type PulseSeries = { round_id: string; points: Array<{ minute: string; cnt: number }>; total: number };

export type PlanetStatsRow = {
  round_id: string;
  votes_total: number;
  votes_verified: number;
  votes_flagged: number;
  countries_unlocked: number;
  survival_raw: number | null;
  survival_weighted: number | null;
  contradiction_raw: number | null;
  contradiction_weighted: number | null;
  realism_mean: number | null;
  compromise_mean: number | null;
  consistency_mean: number | null;
  axis_means: AxisMeans;
  archetype_shares: ArchetypeShares;
  contradiction_shares: Record<string, ShareEntry>;
  pulse_per_min: number;
  pulse_refreshed_at: string;
  computed_at: string;
};

export type CountryAggregate = {
  country_code: string;
  n: number;
  verified_n: number;
  weight_sum: number;
  survival: RawWeighted;
  contradiction: RawWeighted;
  realism: RawWeighted;
  compromise: RawWeighted;
  axis_means: AxisMeans;
  archetypes: ArchetypeShares;
  pairs: Record<string, ShareEntry>;
  top_archetype: string | null;
};

export type CountryStatsRow = {
  country_code: string;
  submissions_count: number;
  verified_count: number;
  unlocked: boolean;
  insufficient_sample: boolean;
  survival_index: number | null;
  contradiction_index: number | null;
  realism_mean: number | null;
  compromise_mean: number | null;
  axis_means: AxisMeans;
  archetype_shares: ArchetypeShares;
  contradiction_shares: Record<string, ShareEntry>;
  top_archetype: string | null;
  titles: string[];
  rank: number | null;
};

export type CountryBoard = {
  round_id: string;
  unlock_threshold: number;
  computed_at: string | null;
  countries: Array<CountryStatsRow & { name_en: string; region: string | null; population: number }>;
};

export type CountryResults = {
  round_id: string;
  country_code: string;
  name_en: string | null;
  population: number | null;
  region: string | null;
  known: boolean;
  stats: (CountryStatsRow & { computed_at: string }) | null;
  live_count: number;
  unlock_threshold: number;
  questions: Array<{
    question_id: string;
    key: string;
    position: number;
    i18n: I18nMap<LocalizedQuestion>;
    anchor: boolean;
    total_raw: number;
    options: Array<{ option_id: string; key: string; icon: string | null; i18n: I18nMap<LocalizedOption>; raw: number; share_raw: number | null; share_weighted: number | null; planet_share_raw: number | null; planet_share_weighted: number | null }>;
  }>;
  rivals: Array<{ country_code: string; name_en: string; survival_index: number | null; rank: number }>;
};

export type NarratorPost = {
  id: string;
  round_id: string | null;
  locale: string;
  body: string;
  model: string | null;
  approved: boolean;
  generated_at: string;
  published_at: string | null;
  context?: unknown;
};

export type VoterStatus = { voter_id: string; trust: TrustLevel; verified: boolean; submission_id: string | null; submissions_total: number } | null;

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;
