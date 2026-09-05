import { readFileSync } from "node:fs";
import { parse } from "yaml";
const files = ["2026-w37", "2026-w38", "2026-w39", "2026-w40", "2026-w41", "anchor"].map((n) => `content/rounds/${n}.yaml`);
type Q = { key: string; type: string; i18n?: Record<string, { text?: string; scenario?: string }>; options?: Array<{ key: string; compromise?: boolean; honeypot?: boolean; i18n?: Record<string, { text?: string }> }> };
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
