import { z } from "zod";
import { AGE_BANDS, AXES, COMPASS_BIASES, COMPASS_SECTIONS, QUESTION_TYPES, ROUND_KINDS, ROUND_STATUSES } from "@/types/domain";

// ---------------------------------------------------------------------------
// Zod schemas for everything under content/. Loader validates before anything touches the DB.
// ---------------------------------------------------------------------------

const key = z.string().regex(/^[a-z0-9_]+$/, "keys are snake_case ascii");
const localeCode = z.string().regex(/^[a-z]{2}(-[A-Za-z]{2,4})?$/);

export const localizedQuestionSchema = z.object({
  text: z.string().min(1).max(200),
  scenario: z.string().max(200).optional(),
  machine: z.boolean().optional(),
  reviewed: z.boolean().optional(),
});
export const localizedOptionSchema = z.object({
  text: z.string().min(1).max(120),
  machine: z.boolean().optional(),
  reviewed: z.boolean().optional(),
});
export const localizedLabelSchema = z.object({
  title: z.string().min(1).max(160),
  blurb: z.string().max(400).optional(),
  share: z.string().max(200).optional(),
  machine: z.boolean().optional(),
});

const axisWeights = z
  .object(Object.fromEntries(AXES.map((a) => [a, z.number().min(-1).max(1).optional()])) as Record<(typeof AXES)[number], z.ZodOptional<z.ZodNumber>>)
  .strict();

export const optionSchema = z.object({
  key,
  icon: z.string().max(8).optional(),
  i18n: z.record(localeCode, localizedOptionSchema).refine((m) => "cs" in m || "en" in m, "option needs cs or en"),
  axis_weights: axisWeights.default({}),
  compromise: z.boolean().default(false),
  honeypot: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    key,
    type: z.enum(QUESTION_TYPES),
    position: z.number().int().positive().optional(),
    i18n: z.record(localeCode, localizedQuestionSchema).refine((m) => "cs" in m || "en" in m, "question needs cs or en"),
    options: z.array(optionSchema).default([]),
    target: z.object({ question: key, option: key }).optional(),
    review_required: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    if (q.type === "choice") {
      if (q.options.length < 2 || q.options.length > 4) ctx.addIssue({ code: "custom", message: `choice question ${q.key} needs 2–4 options` });
      if (q.target) ctx.addIssue({ code: "custom", message: `choice question ${q.key} must not have a target` });
      const keys = new Set(q.options.map((o) => o.key));
      if (keys.size !== q.options.length) ctx.addIssue({ code: "custom", message: `duplicate option keys in ${q.key}` });
    } else {
      if (!q.target) ctx.addIssue({ code: "custom", message: `meta question ${q.key} needs a target` });
      if (q.options.length > 0) ctx.addIssue({ code: "custom", message: `meta question ${q.key} must not have options` });
    }
  });

export const survivalWeightsSchema = z
  .object({ consistency: z.number().min(0).max(1), compromise: z.number().min(0).max(1), realism: z.number().min(0).max(1) })
  .refine((w) => Math.abs(w.consistency + w.compromise + w.realism - 1) < 1e-6, "survival_weights must sum to 1");

export const roundHeaderSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(ROUND_KINDS),
  status: z.enum(ROUND_STATUSES).default("draft"),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date().nullable().default(null),
  unlock_threshold: z.number().int().positive().default(500),
  survival_weights: survivalWeightsSchema.default({ consistency: 0.4, compromise: 0.35, realism: 0.25 }),
  i18n: z.record(localeCode, localizedLabelSchema).default({}),
});

export const roundFileSchema = z.object({
  round: roundHeaderSchema,
  include_anchors: z.array(z.union([key, z.object({ key, position: z.number().int().positive() })])).default([]),
  questions: z.array(questionSchema).default([]),
});

export const contradictionsFileSchema = z.object({
  pairs: z.array(
    z
      .object({
        key,
        a: z.object({ question: key, option: key }),
        b: z.object({ question: key, option: key }),
        i18n: z.record(localeCode, localizedLabelSchema),
      })
      // Two options of the same question can never be chosen together: such a pair would only
      // inflate the consistency denominator (ARCHITECTURE §8) without ever activating.
      .superRefine((p, ctx) => {
        if (p.a.question === p.b.question) ctx.addIssue({ code: "custom", message: `contradiction pair ${p.key} must span two different questions` });
      }),
  ),
});

const comparison = z.object({ lt: z.number().optional(), lte: z.number().optional(), gt: z.number().optional(), gte: z.number().optional() }).strict();
export const archetypesFileSchema = z.object({
  archetypes: z
    .array(
      z.object({
        key,
        emoji: z.string().optional(),
        color: z.string().optional(),
        when: z
          .object({
            abs_all_axes_below: z.number().min(0).max(1).optional(),
            peace_force: comparison.optional(),
            trust_paranoia: comparison.optional(),
            us_them: comparison.optional(),
            realism: comparison.optional(),
            consistency: comparison.optional(),
            compromise: comparison.optional(),
            survival: comparison.optional(),
          })
          .strict(),
        i18n: z.record(localeCode, localizedLabelSchema).optional(),
      }),
    )
    .min(1)
    .refine((list) => Object.keys(list[list.length - 1]!.when).length === 0, "last archetype rule must be the fallback (when: {})"),
});

export const titlesFileSchema = z.object({
  titles: z.array(
    z.object({
      key,
      metric: z.enum([
        "axis_means.peace_force",
        "axis_means.trust_paranoia",
        "axis_means.us_them",
        "survival_index",
        "contradiction_index",
        "realism_mean",
        "compromise_mean",
      ]),
      pick: z.enum(["max", "min"]),
      emoji: z.string().optional(),
      i18n: z.record(localeCode, localizedLabelSchema),
    }),
  ),
});

export const propheciesFileSchema = z.object({
  prophecies: z
    .array(
      z
        .object({
          key,
          category: z.string().max(40).optional(),
          opens_at: z.coerce.date(),
          closes_at: z.coerce.date(),
          resolves_at: z.coerce.date(),
          review_required: z.boolean().default(true),
          i18n: z.record(localeCode, localizedLabelSchema).refine((m) => "cs" in m || "en" in m, "prophecy needs cs or en"),
        })
        .superRefine((p, ctx) => {
          if (p.closes_at <= p.opens_at) ctx.addIssue({ code: "custom", message: `prophecy ${p.key} closes before it opens` });
          if (p.resolves_at < p.closes_at) ctx.addIssue({ code: "custom", message: `prophecy ${p.key} resolves before it closes` });
          // A prophecy nobody can check is a rumour: every one must name where it is settled.
          for (const [loc, v] of Object.entries(p.i18n)) {
            if (!v.blurb || v.blurb.trim().length < 10) ctx.addIssue({ code: "custom", message: `prophecy ${p.key} (${loc}) needs a blurb naming the source that settles it` });
          }
        }),
    )
    .default([]),
});

export const duelsFileSchema = z.object({
  duels: z
    .array(
      z
        .object({
          key: z.string().regex(/^[a-z]{2}-[a-z]{2}$/, "duel keys are '<a>-<b>' in lowercase ISO-3166 alpha-2"),
          a: z.string().length(2).regex(/^[A-Z]{2}$/),
          b: z.string().length(2).regex(/^[A-Z]{2}$/),
          i18n: z.record(localeCode, localizedLabelSchema),
        })
        .superRefine((d, ctx) => {
          if (d.a === d.b) ctx.addIssue({ code: "custom", message: `duel ${d.key} pits ${d.a} against itself` });
          if (d.key !== `${d.a.toLowerCase()}-${d.b.toLowerCase()}`) ctx.addIssue({ code: "custom", message: `duel key ${d.key} must be '${d.a.toLowerCase()}-${d.b.toLowerCase()}'` });
        }),
    )
    .default([]),
});

export const weightingFileSchema = z.object({
  country_clamp: z.tuple([z.number().positive(), z.number().positive()]),
  cell_clamp: z.tuple([z.number().positive(), z.number().positive()]),
  min_country_submissions: z.number().int().positive(),
  min_demographic_submissions: z.number().int().positive(),
  max_iterations: z.number().int().positive(),
  tolerance: z.number().positive(),
  too_fast_seconds: z.number().positive(),
  rate_ip_per_hour: z.number().int().positive(),
  rate_anon_per_hour: z.number().int().positive(),
  rate_ip_per_hour_class: z.number().int().positive().default(60),
  min_class_submissions: z.number().int().positive().default(5),
  compass_seconds_per_card: z.number().positive().default(1.5),
});

export type RoundFile = z.infer<typeof roundFileSchema>;
export type ContradictionsFile = z.infer<typeof contradictionsFileSchema>;
export type ArchetypesFile = z.infer<typeof archetypesFileSchema>;
export type TitlesFile = z.infer<typeof titlesFileSchema>;
export type WeightingFile = z.infer<typeof weightingFileSchema>;
export type DuelsFile = z.infer<typeof duelsFileSchema>;
export type PropheciesFile = z.infer<typeof propheciesFileSchema>;
export type AgeBandKey = (typeof AGE_BANDS)[number];

// ---------------------------------------------------------------------------
// Compass (ARCHITECTURE §17) — the fact test and the values/trust profile.
// A deliberately separate shape from rounds: a fact has a correct answer and a source,
// neither of which a dilemma may ever have.
// ---------------------------------------------------------------------------

/** A fact nobody can check is a quiz question. Every one names where it was read and when. */
export const compassSourceSchema = z.object({
  name: z.string().min(3).max(160),
  url: z.string().url(),
  as_of: z.coerce.date(),
  review_by: z.coerce.date(),
});

export const compassOptionSchema = z.object({
  key,
  icon: z.string().max(8).optional(),
  i18n: z.record(localeCode, localizedOptionSchema).refine((m) => "cs" in m || "en" in m, "compass option needs cs or en"),
  correct: z.boolean().default(false),
  bias: z.enum(COMPASS_BIASES).optional(),
  axis_weights: axisWeights.default({}),
});

export const compassQuestionSchema = z
  .object({
    key,
    section: z.enum(COMPASS_SECTIONS),
    position: z.number().int().positive(),
    source: compassSourceSchema.optional(),
    i18n: z.record(localeCode, localizedQuestionSchema).refine((m) => "cs" in m || "en" in m, "compass question needs cs or en"),
    /** Shown at the reveal: the true value in words, with the number. Facts only. */
    i18n_answer: z.record(localeCode, localizedQuestionSchema).optional(),
    options: z.array(compassOptionSchema).min(2).max(4),
    review_required: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    const keys = new Set(q.options.map((o) => o.key));
    if (keys.size !== q.options.length) add(`duplicate option keys in compass question ${q.key}`);

    if (q.section === "fact") {
      // Three options exactly: chance is then exactly one third, which is the whole point.
      if (q.options.length !== 3) add(`fact ${q.key} needs exactly 3 options, has ${q.options.length}`);
      const correct = q.options.filter((o) => o.correct);
      if (correct.length !== 1) add(`fact ${q.key} needs exactly one correct option, has ${correct.length}`);
      if (!q.source) add(`fact ${q.key} needs a source with a name, url and date`);
      if (!q.i18n_answer || !("cs" in q.i18n_answer || "en" in q.i18n_answer)) add(`fact ${q.key} needs i18n_answer explaining the true value`);
      for (const o of q.options) {
        if (!o.correct && !o.bias) add(`fact ${q.key}: wrong option '${o.key}' needs bias: pessimistic or optimistic`);
        if (o.correct && o.bias) add(`fact ${q.key}: correct option '${o.key}' must not carry a bias`);
        if (Object.keys(o.axis_weights).length > 0) add(`fact ${q.key}: option '${o.key}' must not carry axis_weights — a fact is not an opinion`);
      }
    } else {
      if (q.options.some((o) => o.correct)) add(`${q.section} question ${q.key} must not mark an option correct`);
      if (q.options.some((o) => o.bias)) add(`${q.section} question ${q.key} must not carry bias`);
      if (q.source) add(`${q.section} question ${q.key} has no factual claim, so it must not carry a source`);
      if (!q.options.some((o) => Object.keys(o.axis_weights).length > 0)) add(`${q.section} question ${q.key} needs axis_weights on at least one option, or it measures nothing`);
    }
  });

export const compassFileSchema = z.object({
  compass: z.object({
    /** Bumping the version lets everyone retake the test after the facts are refreshed. */
    version: z.number().int().positive(),
    i18n: z.record(localeCode, localizedLabelSchema).refine((m) => "cs" in m || "en" in m, "compass needs cs or en"),
  }),
  questions: z.array(compassQuestionSchema).min(1),
});

export type CompassFile = z.infer<typeof compassFileSchema>;
export type CompassQuestionFile = z.infer<typeof compassQuestionSchema>;
