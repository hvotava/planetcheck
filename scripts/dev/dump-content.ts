import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";

/**
 * `pnpm content:list` — every question and option as plain text, for reading the decks
 * without opening six YAML files. Review tool, not part of the build.
 */
const files = readdirSync("content/rounds")
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((f) => `content/rounds/${f}`);
type Q = { key: string; type: string; i18n?: Record<string, { text?: string; scenario?: string }>; options?: Array<{ key: string; compromise?: boolean; honeypot?: boolean; i18n?: Record<string, { text?: string }> }> };
const compass = parse(readFileSync("content/compass.yaml", "utf8")) as {
  compass: { version: number };
  questions: Array<{ key: string; section: string; i18n?: Record<string, { text?: string; scenario?: string }>; options: Array<{ key: string; correct?: boolean; bias?: string; i18n?: Record<string, { text?: string }> }> }>;
};

for (const f of files) {
  const d = parse(readFileSync(f, "utf8")) as { round: { slug: string; i18n?: Record<string, { title?: string }> }; questions?: Q[] };
  console.log(`\n===== ${d.round.slug}  ${d.round.i18n?.cs?.title ?? ""}`);
  for (const q of d.questions ?? []) {
    const cs = q.i18n?.cs ?? {};
    console.log(`  [${q.type[0]}] ${q.key}: ${cs.scenario ? cs.scenario + " " : ""}${cs.text ?? ""}`);
    for (const o of q.options ?? []) {
      const m = (o.compromise ? "K" : "") + (o.honeypot ? "H" : "");
      console.log(`       - ${o.key.padEnd(16)} ${m.padEnd(2)} ${o.i18n?.cs?.text ?? ""}`);
    }
  }
}

console.log(`\n===== kompas v${compass.compass.version}`);
for (const q of compass.questions) {
  const cs = q.i18n?.cs ?? {};
  console.log(`  [${q.section[0]}] ${q.key}: ${cs.scenario ? cs.scenario + " " : ""}${cs.text ?? ""}`);
  for (const o of q.options) {
    const mark = o.correct ? "✓" : o.bias ? (o.bias === "pessimistic" ? "↓" : "↑") : " ";
    console.log(`       ${mark} ${o.key.padEnd(18)} ${o.i18n?.cs?.text ?? ""}`);
  }
}
