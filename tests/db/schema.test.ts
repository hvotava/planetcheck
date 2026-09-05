import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteExecutor } from "@/lib/db/pglite";
import { runMigrations } from "@/lib/db/migrate";
import { AGE_BANDS, GENDERS, QUESTION_TYPES, ROUND_KINDS, ROUND_STATUSES, SETTLEMENTS, TRUST_LEVELS } from "@/types/domain";
import type { DbExecutor } from "@/lib/db/executor";

let db: DbExecutor;

beforeAll(async () => {
  db = await createPgliteExecutor();
});
afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("apply in order, exactly once", async () => {
    // Migrations are append-only, so this list only ever grows (CLAUDE.md conventions).
    const first = await runMigrations(db);
    expect(first.applied).toEqual(["0001_init.sql", "0002_schema_additions.sql", "0003_api_functions.sql", "0004_prophecies.sql"]);
    const second = await runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.applied);
  });

  it("db_health answers", async () => {
    const h = await db.rpc<{ ok: boolean; rounds: number; submissions: number }>("db_health", {});
    expect(h.ok).toBe(true);
    expect(h.rounds).toBe(0);
    expect(h.submissions).toBe(0);
  });

  it("DB enums match src/types/domain.ts constants", async () => {
    const rows = await db.query<{ enum_name: string; labels: string[] }>(
      `select t.typname as enum_name, array_agg(e.enumlabel order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid group by t.typname`,
    );
    const byName = new Map(rows.map((r) => [r.enum_name, r.labels]));
    expect(byName.get("age_band")).toEqual([...AGE_BANDS]);
    expect(byName.get("gender_band")).toEqual([...GENDERS]);
    expect(byName.get("settlement_band")).toEqual([...SETTLEMENTS]);
    expect(byName.get("trust_level")).toEqual([...TRUST_LEVELS]);
    expect(byName.get("round_kind")).toEqual([...ROUND_KINDS]);
    expect(byName.get("round_status")).toEqual([...ROUND_STATUSES]);
    expect(byName.get("question_type")).toEqual([...QUESTION_TYPES]);
  });
});
