/**
 * Domain vocabulary shared by content, scoring, weighting, API and UI.
 * Pure types + constants, no I/O. Keep in sync with db/migrations enums —
 * tests/db/enums.test.ts guards against drift.
 */

export const AXES = ["peace_force", "trust_paranoia", "us_them"] as const;
export type AxisKey = (typeof AXES)[number];
export type AxisWeights = Partial<Record<AxisKey, number>>;
export type AxisScores = Record<AxisKey, number>;

export const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDERS = ["f", "m", "x"] as const;
export type Gender = (typeof GENDERS)[number];

export const SETTLEMENTS = ["city", "town", "rural"] as const;
export type Settlement = (typeof SETTLEMENTS)[number];

export const TRUST_LEVELS = ["anon", "verified"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const ROUND_KINDS = ["anchor", "weekly", "flash"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_STATUSES = ["draft", "live", "closed"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const QUESTION_TYPES = ["choice", "meta"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// ---------------------------------------------------------------------------
// Compass (ARCHITECTURE §17) — the second index. `fact` questions have a correct answer,
// `values` and `trust` do not: they draw a profile on the same three axes.
// ---------------------------------------------------------------------------

export const COMPASS_SECTIONS = ["fact", "values", "trust"] as const;
export type CompassSection = (typeof COMPASS_SECTIONS)[number];

export const COMPASS_BIASES = ["pessimistic", "optimistic"] as const;
export type CompassBias = (typeof COMPASS_BIASES)[number];

export type ScoringCompassOption = { key: string; correct: boolean; bias?: CompassBias | null; axis_weights: AxisWeights };
export type ScoringCompassQuestion = { key: string; section: CompassSection; options: ScoringCompassOption[] };
export type ScoringCompassDeck = { version: number; questions: ScoringCompassQuestion[] };

export type CompassAnswer = { question: string; option: string };

export type CompassScore = {
  facts_total: number;
  facts_correct: number;
  /** share of facts answered correctly, 0..1; null when no fact was answered */
  knowledge: number | null;
  /** what random clicking would score on the facts actually answered */
  chance: number | null;
  /** (knowledge − chance) / (1 − chance): 0 = no better than random, negative = worse */
  skill: number | null;
  /** how the wrong answers leaned */
  bias: Record<CompassBias, number>;
  axes: AxisScores;
  correct_keys: string[];
};

/** Flags a submission can carry. Flags never block; they only exclude from public numbers. */
export const FLAG_REASONS = [
  "honeypot",
  "too_fast",
  "turnstile_failed",
  "turnstile_unavailable",
  "country_mismatch",
  "rate_ip",
  "rate_anon",
  "duplicate_identity",
  "synthetic",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/** Demographic filter used by "kdyby vládli jen…" (RulerSwitch). */
export type ResultsFilter = {
  trust?: TrustLevel;
  age_band?: AgeBand;
  gender?: Gender;
  settlement?: Settlement;
  country?: string;
};

export type SurvivalWeights = { consistency: number; compromise: number; realism: number };

export type Demographics = {
  age_band?: AgeBand | null;
  gender?: Gender | null;
  settlement?: Settlement | null;
  declared_country?: string | null;
};

// ---------------------------------------------------------------------------
// Content (language-independent structure; texts live in `i18n`)
// ---------------------------------------------------------------------------

export type LocalizedQuestion = { text: string; scenario?: string; machine?: boolean };
export type LocalizedOption = { text: string; machine?: boolean };
export type LocalizedLabel = { title: string; blurb?: string; machine?: boolean };
export type I18nMap<T> = Record<string, T>;

export type ContentOption = {
  key: string;
  position: number;
  i18n: I18nMap<LocalizedOption>;
  axis_weights: AxisWeights;
  compromise: boolean;
  honeypot: boolean;
  icon?: string;
};

export type ContentQuestion = {
  key: string;
  type: QuestionType;
  position: number;
  i18n: I18nMap<LocalizedQuestion>;
  options: ContentOption[];
  /** meta questions only */
  target?: { question: string; option: string };
  review_required: boolean;
  anchor: boolean;
};

export type ContentContradiction = {
  key: string;
  a: { question: string; option: string };
  b: { question: string; option: string };
  i18n: I18nMap<LocalizedLabel>;
};

export type ContentRound = {
  slug: string;
  kind: RoundKind;
  status: RoundStatus;
  starts_at: string;
  ends_at: string | null;
  unlock_threshold: number;
  survival_weights: SurvivalWeights;
  i18n: I18nMap<LocalizedLabel>;
  questions: ContentQuestion[];
  contradictions: ContentContradiction[];
};

// ---------------------------------------------------------------------------
// Scoring (ARCHITECTURE §8)
// ---------------------------------------------------------------------------

export type ScoringOption = { key: string; axis_weights: AxisWeights; compromise: boolean; honeypot: boolean };
export type ScoringQuestion = { key: string; type: QuestionType; options: ScoringOption[] };
export type ScoringRound = {
  questions: ScoringQuestion[];
  contradictions: Array<{ key: string; a: { question: string; option: string }; b: { question: string; option: string } }>;
  survival_weights: SurvivalWeights;
};

export type ChoiceAnswer = { question: string; option: string };
/** `actual` is the weighted share (0–100) at submit time; null when the planet has no data yet. */
export type MetaGuess = { question: string; guess: number; actual: number | null };

export type SubmissionScore = {
  axes: AxisScores;
  /** null when no meta question could be evaluated (no planet data yet) */
  realism: number | null;
  consistency: number;
  compromise: number;
  survival: number;
  archetype: string;
  contradictions_hit: string[];
  honeypot_hit: boolean;
};

export type ArchetypeMetric = AxisKey | "realism" | "consistency" | "compromise" | "survival";
export type ArchetypeComparison = { lt?: number; lte?: number; gt?: number; gte?: number };
export type ArchetypeCondition = Partial<Record<ArchetypeMetric, ArchetypeComparison>> & {
  abs_all_axes_below?: number;
};
export type ArchetypeRule = { key: string; when: ArchetypeCondition };

// ---------------------------------------------------------------------------
// Weighting (ARCHITECTURE §9)
// ---------------------------------------------------------------------------

export type WeightingParams = {
  country_clamp: [number, number];
  cell_clamp: [number, number];
  min_country_submissions: number;
  min_demographic_submissions: number;
  max_iterations: number;
  tolerance: number;
};

export type DemographicTargets = {
  age_band: Record<AgeBand, number>;
  gender: Record<"f" | "m", number>;
};

export type CountryPopulation = { code: string; population: number; targets?: DemographicTargets };

export type SubmissionCell = {
  country: string | null;
  age_band: AgeBand | null;
  gender: Gender | null;
  n: number;
};

export type CellWeight = SubmissionCell & { weight: number };

export type CountryWeightDiagnostics = {
  country: string;
  n: number;
  country_weight: number;
  insufficient_sample: boolean;
  raked: boolean;
  iterations: number;
  converged: boolean;
};

export type WeightingResult = {
  cells: CellWeight[];
  countries: CountryWeightDiagnostics[];
  total: number;
};
