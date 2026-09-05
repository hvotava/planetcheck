import { z } from "zod";
import { AGE_BANDS, GENDERS, SETTLEMENTS } from "@/types/domain";

const uuid = z.string().uuid();

export const voteBodySchema = z.object({
  roundId: uuid,
  answers: z.array(z.object({ questionId: uuid, optionId: uuid })).min(1).max(20),
  metaGuesses: z.array(z.object({ questionId: uuid, guess: z.number().int().min(0).max(100) })).max(10).default([]),
  demographics: z
    .object({
      age_band: z.enum(AGE_BANDS).nullable().optional(),
      gender: z.enum(GENDERS).nullable().optional(),
      settlement: z.enum(SETTLEMENTS).nullable().optional(),
      declared_country: z.string().regex(/^[A-Za-z]{2}$/).nullable().optional(),
    })
    .optional(),
  token: z.string().max(4096).nullable().optional(),
  loadedAt: z.string().datetime({ offset: true }).nullable().optional(),
  locale: z.string().max(10).optional(),
  /** School mode: an unknown or inactive code is ignored, never a reason to refuse the vote. */
  classCode: z.string().regex(/^[A-Za-z0-9]{6}$/).nullable().optional(),
});

export type VoteBody = z.infer<typeof voteBodySchema>;
