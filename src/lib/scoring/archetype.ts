import { AXES, type ArchetypeComparison, type ArchetypeMetric, type ArchetypeRule, type SubmissionScore } from "@/types/domain";

type Metrics = Omit<SubmissionScore, "archetype" | "contradictions_hit" | "honeypot_hit">;

function metricValue(m: Metrics, key: ArchetypeMetric): number | null {
  switch (key) {
    case "peace_force":
    case "trust_paranoia":
    case "us_them":
      return m.axes[key];
    case "realism":
      return m.realism;
    case "consistency":
      return m.consistency;
    case "compromise":
      return m.compromise;
    case "survival":
      return m.survival;
  }
}

function compare(v: number, c: ArchetypeComparison): boolean {
  if (c.lt != null && !(v < c.lt)) return false;
  if (c.lte != null && !(v <= c.lte)) return false;
  if (c.gt != null && !(v > c.gt)) return false;
  if (c.gte != null && !(v >= c.gte)) return false;
  return true;
}

/** Does a single rule match? A metric that is null (realism without data) never matches a comparison. */
export function ruleMatches(rule: ArchetypeRule, m: Metrics): boolean {
  const { abs_all_axes_below, ...rest } = rule.when;
  if (abs_all_axes_below != null && !AXES.every((a) => Math.abs(m.axes[a]) < abs_all_axes_below)) return false;
  for (const [key, cmp] of Object.entries(rest) as Array<[ArchetypeMetric, ArchetypeComparison | undefined]>) {
    if (!cmp) continue;
    const v = metricValue(m, key);
    if (v == null || !compare(v, cmp)) return false;
  }
  return true;
}

/** Rules evaluated top-down, first match wins; the last rule must be the fallback (`when: {}`). Pure. */
export function assignArchetype(m: Metrics, rules: ArchetypeRule[]): string {
  for (const rule of rules) if (ruleMatches(rule, m)) return rule.key;
  const last = rules[rules.length - 1];
  if (!last) throw new Error("archetype rules are empty");
  return last.key;
}
