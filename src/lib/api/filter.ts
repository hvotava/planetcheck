import { z } from "zod";
import { AGE_BANDS, GENDERS, SETTLEMENTS, TRUST_LEVELS } from "@/types/domain";
import type { ResultsFilterPayload } from "@/types/api";

const schema = z.object({
  trust: z.enum(TRUST_LEVELS).optional(),
  age_band: z.enum(AGE_BANDS).optional(),
  gender: z.enum(GENDERS).optional(),
  settlement: z.enum(SETTLEMENTS).optional(),
  country: z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).optional(),
});

/** Parses ?trust=&age_band=&gender=&settlement=&country= into a validated filter (empty strings ignored). */
export function parseFilter(params: URLSearchParams): { filter: ResultsFilterPayload; filtered: boolean } | { error: string } {
  const raw: Record<string, string> = {};
  for (const k of ["trust", "age_band", "gender", "settlement", "country"]) {
    const v = params.get(k);
    if (v) raw[k] = v;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid filter." };
  return { filter: parsed.data, filtered: Object.keys(parsed.data).length > 0 };
}
