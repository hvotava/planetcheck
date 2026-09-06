import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { isKnownCountry } from "@/lib/countries";
import type { ArchetypeRule, ContentContradiction, ContentQuestion, ContentRound, WeightingParams } from "@/types/domain";
import {
  archetypesFileSchema,
  compassFileSchema,
  contradictionsFileSchema,
  duelsFileSchema,
  propheciesFileSchema,
  roundFileSchema,
  titlesFileSchema,
  weightingFileSchema,
  type ArchetypesFile,
  type CompassFile,
  type DuelsFile,
  type PropheciesFile,
  type RoundFile,
  type TitlesFile,
  type WeightingFile,
} from "./schema";

/**
 * Loads + validates everything under content/. Node-only (fs). Used by scripts,
 * the PGlite bootstrap and server components (methodology). Never import from client code.
 */

export const CONTENT_DIR = resolve(process.cwd(), "content");

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

export function loadWeighting(dir = CONTENT_DIR): WeightingFile {
  return weightingFileSchema.parse(readYaml(join(dir, "weighting.yaml")));
}

export function weightingParams(w: WeightingFile): WeightingParams {
  return {
    country_clamp: w.country_clamp,
    cell_clamp: w.cell_clamp,
    min_country_submissions: w.min_country_submissions,
    min_demographic_submissions: w.min_demographic_submissions,
    max_iterations: w.max_iterations,
    tolerance: w.tolerance,
  };
}

export function loadArchetypes(dir = CONTENT_DIR): ArchetypesFile {
  return archetypesFileSchema.parse(readYaml(join(dir, "archetypes.yaml")));
}

export function archetypeRules(a: ArchetypesFile): ArchetypeRule[] {
  return a.archetypes.map((x) => ({ key: x.key, when: x.when }));
}

export function loadTitles(dir = CONTENT_DIR): TitlesFile {
  return titlesFileSchema.parse(readYaml(join(dir, "titles.yaml")));
}

/** Prophecies from content/prophecies.yaml. Outcomes are never content — only an operator resolves one. */
export function loadProphecies(dir = CONTENT_DIR): PropheciesFile["prophecies"] {
  const list = propheciesFileSchema.parse(readYaml(join(dir, "prophecies.yaml"))).prophecies;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const p of list) {
    if (seen.has(p.key)) errors.push(`duplicate prophecy key '${p.key}'`);
    seen.add(p.key);
  }
  if (errors.length) throw new Error(`content/prophecies.yaml:\n  - ${errors.join("\n  - ")}`);
  return list;
}

/**
 * Curated country duels. Codes are cross-checked against data/countries.json here, so a typo
 * in content/duels.yaml fails the build rather than producing an empty page.
 */
export function loadDuels(dir = CONTENT_DIR): DuelsFile["duels"] {
  const duels = duelsFileSchema.parse(readYaml(join(dir, "duels.yaml"))).duels;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const d of duels) {
    if (seen.has(d.key)) errors.push(`duplicate duel key '${d.key}'`);
    seen.add(d.key);
    for (const code of [d.a, d.b]) if (!isKnownCountry(code)) errors.push(`duel '${d.key}': unknown country code '${code}'`);
  }
  if (errors.length) throw new Error(`content/duels.yaml:\n  - ${errors.join("\n  - ")}`);
  return duels;
}

/**
 * The Kompas deck (ARCHITECTURE §17). Structural problems throw, so a broken deck fails the
 * build rather than the product. Staleness does not throw — see `staleFacts` — because a
 * fact that needs rechecking must not take the running site down with it.
 */
export function loadCompass(dir = CONTENT_DIR): CompassFile {
  const file = compassFileSchema.parse(readYaml(join(dir, "compass.yaml")));
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const seenPositions = new Map<number, string>();
  for (const q of file.questions) {
    if (seenKeys.has(q.key)) errors.push(`duplicate compass question key '${q.key}'`);
    seenKeys.add(q.key);
    const other = seenPositions.get(q.position);
    if (other) errors.push(`position ${q.position} used by both '${other}' and '${q.key}'`);
    seenPositions.set(q.position, q.key);
  }
  const facts = file.questions.filter((q) => q.section === "fact");
  // Fewer than three facts and the "worse than chance" comparison stops meaning anything.
  if (facts.length < 3) errors.push(`compass needs at least 3 facts, has ${facts.length}`);
  if (errors.length) throw new Error(`content/compass.yaml:\n  - ${errors.join("\n  - ")}`);
  return { compass: file.compass, questions: [...file.questions].sort((a, b) => a.position - b.position) };
}

/** Facts whose `review_by` has passed. `pnpm content:check` fails on these; the site does not. */
export function staleFacts(file: CompassFile, now = new Date()): Array<{ key: string; review_by: Date; source: string }> {
  return file.questions
    .filter((q) => q.section === "fact" && q.source && q.source.review_by < now)
    .map((q) => ({ key: q.key, review_by: q.source!.review_by, source: q.source!.name }));
}

export function loadContradictionsLibrary(dir = CONTENT_DIR): ContentContradiction[] {
  return contradictionsFileSchema.parse(readYaml(join(dir, "contradictions.yaml"))).pairs;
}

function roundFiles(dir: string): string[] {
  return readdirSync(join(dir, "rounds"))
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => join(dir, "rounds", f));
}

/**
 * Loads all rounds, expands `include_anchors` from anchor.yaml, attaches contradiction pairs
 * whose both questions exist in the round, and runs cross-reference validation
 * (unique keys/positions, exactly one honeypot, meta immediately before its target, 3–9 dilemmas).
 */
export function loadRounds(dir = CONTENT_DIR): ContentRound[] {
  const files = roundFiles(dir).map((f) => ({ file: f, data: roundFileSchema.parse(readYaml(f)) }));
  const anchorFile = files.find((f) => f.data.round.kind === "anchor");
  const library = new Map<string, RoundFile["questions"][number]>();
  if (anchorFile) for (const q of anchorFile.data.questions) library.set(q.key, q);
  const pairs = loadContradictionsLibrary(dir);

  return files.map(({ file, data }) => {
    const errors: string[] = [];
    const questions: ContentQuestion[] = [];

    // Explicit positions win; unpositioned questions fill the lowest free slots in listing order.
    const pending: Array<{ q: ContentQuestion; explicit: number | null }> = [];
    for (const inc of data.include_anchors) {
      const k = typeof inc === "string" ? inc : inc.key;
      const src = library.get(k);
      if (!src) {
        errors.push(`include_anchors: unknown anchor question '${k}'`);
        continue;
      }
      pending.push({ q: toQuestion(src, 0, true), explicit: typeof inc === "string" ? null : inc.position });
    }
    for (const q of data.questions) pending.push({ q: toQuestion(q, 0, data.round.kind === "anchor"), explicit: q.position ?? null });
    const taken = new Map<number, string>();
    for (const { q, explicit } of pending) {
      if (explicit == null) continue;
      const other = taken.get(explicit);
      if (other) errors.push(`position ${explicit} used by both '${other}' and '${q.key}'`);
      taken.set(explicit, q.key);
      q.position = explicit;
    }
    let slot = 1;
    for (const { q, explicit } of pending) {
      if (explicit != null) continue;
      while (taken.has(slot)) slot++;
      taken.set(slot, q.key);
      q.position = slot;
    }
    questions.push(...pending.map((x) => x.q));
    questions.sort((a, b) => a.position - b.position);

    // --- cross validation
    const keys = new Set<string>();
    for (const q of questions) {
      if (keys.has(q.key)) errors.push(`duplicate question key '${q.key}'`);
      keys.add(q.key);
    }
    const honeypots = questions.flatMap((q) => q.options.filter((o) => o.honeypot).map((o) => `${q.key}.${o.key}`));
    if (data.round.status !== "draft" && honeypots.length !== 1)
      errors.push(`round must contain exactly one honeypot option, found ${honeypots.length} (${honeypots.join(", ")})`);
    for (const q of questions) {
      if (q.type !== "meta" || !q.target) continue;
      const t = questions.find((x) => x.key === q.target!.question);
      if (!t) errors.push(`meta '${q.key}' targets unknown question '${q.target.question}'`);
      else {
        if (!t.options.some((o) => o.key === q.target!.option)) errors.push(`meta '${q.key}' targets unknown option '${q.target.question}.${q.target.option}'`);
        // The guess must be made before the planet's distribution of the target is shown
        // (PlanetFeedback reveals it right after the target is answered), so the meta card
        // sits immediately before its target card.
        if (t.position !== q.position + 1) errors.push(`meta '${q.key}' must come immediately before its target '${t.key}' (position ${q.position + 1})`);
      }
    }
    const choiceCount = questions.filter((q) => q.type === "choice").length;
    if (data.round.status !== "draft" && (choiceCount < 3 || choiceCount > 9)) errors.push(`round has ${choiceCount} choice questions; expected 3–9`);

    const contradictions = pairs.filter((p) => {
      const qa = questions.find((q) => q.key === p.a.question);
      const qb = questions.find((q) => q.key === p.b.question);
      return qa?.options.some((o) => o.key === p.a.option) && qb?.options.some((o) => o.key === p.b.option);
    });

    if (errors.length) throw new Error(`content/${file.slice(dir.length + 1)}:\n  - ${errors.join("\n  - ")}`);

    return {
      slug: data.round.slug,
      kind: data.round.kind,
      status: data.round.status,
      starts_at: data.round.starts_at.toISOString(),
      ends_at: data.round.ends_at ? data.round.ends_at.toISOString() : null,
      unlock_threshold: data.round.unlock_threshold,
      survival_weights: data.round.survival_weights,
      i18n: data.round.i18n,
      questions,
      contradictions,
    };
  });
}

function toQuestion(q: RoundFile["questions"][number], position: number, anchor: boolean): ContentQuestion {
  return {
    key: q.key,
    type: q.type,
    position,
    i18n: q.i18n,
    review_required: q.review_required,
    anchor,
    target: q.target,
    options: q.options.map((o, i) => ({
      key: o.key,
      position: i + 1,
      i18n: o.i18n,
      axis_weights: o.axis_weights,
      compromise: o.compromise,
      honeypot: o.honeypot,
      icon: o.icon,
    })),
  };
}

export type ContentBundle = {
  rounds: ContentRound[];
  archetypes: ArchetypesFile;
  titles: TitlesFile;
  weighting: WeightingFile;
  duels: DuelsFile["duels"];
  prophecies: PropheciesFile["prophecies"];
  compass: CompassFile;
};

export function loadContent(dir = CONTENT_DIR): ContentBundle {
  return {
    rounds: loadRounds(dir),
    archetypes: loadArchetypes(dir),
    titles: loadTitles(dir),
    weighting: loadWeighting(dir),
    duels: loadDuels(dir),
    prophecies: loadProphecies(dir),
    compass: loadCompass(dir),
  };
}
