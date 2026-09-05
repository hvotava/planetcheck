import "./_env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";
import { env } from "@/lib/env";
import { LOCALES } from "@/lib/i18n/locales";

/**
 * pnpm translate -- --to sk,de,pl [--messages] [--content] [--dry-run]
 *
 * Machine translation via Claude (Haiku by default) for:
 *  - messages/<locale>.json      (UI strings; missing keys only, English as the source)
 *  - content/rounds/*.yaml, contradictions.yaml, archetypes.yaml, titles.yaml
 *    (missing locales only; written with `machine: true`; review_required questions stay gated
 *     until a human sets `reviewed: true` — ARCHITECTURE §11)
 *
 * Community fixes = pull requests editing the generated text. Never overwrites human text.
 */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const LANGUAGE_NAMES: Record<string, string> = {
  cs: "Czech", sk: "Slovak", en: "English", de: "German", pl: "Polish", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese",
  nl: "Dutch", sv: "Swedish", fi: "Finnish", da: "Danish", no: "Norwegian", hu: "Hungarian", ro: "Romanian", uk: "Ukrainian", ru: "Russian",
  tr: "Turkish", el: "Greek", ja: "Japanese", ko: "Korean", zh: "Chinese (Simplified)", ar: "Arabic", hi: "Hindi", id: "Indonesian", vi: "Vietnamese",
};

const SYSTEM = `You translate UI strings and game content for "Will we survive?" (Přežijeme?), a playful global game about geopolitical dilemmas told as village allegories.
Rules: keep the dry, witty tone; keep ICU placeholders like {count}, {pct}, plural syntax {count, plural, one {...} other {...}} intact and adapt plural categories to the target language; keep emoji; keep line length similar; never add explanations.
Reply with JSON only: an object mapping each input key to its translation.`;

async function translateBatch(pairs: Record<string, string>, target: string, model: string, apiKey: string): Promise<Record<string, string>> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const language = LANGUAGE_NAMES[target] ?? target;
  const msg = await client.messages.create({
    model,
    max_tokens: 8000,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: "user", content: `Target language: ${language} (${target}). Source language: English.\n\n${JSON.stringify(pairs, null, 2)}` }],
  });
  const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as Record<string, string>;
}

function flatten(obj: Json, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else if (typeof obj === "string") out[prefix] = obj;
  return out;
}

function setPath(obj: Record<string, Json>, path: string, value: string) {
  const parts = path.split(".");
  let cur: Record<string, Json> = obj;
  for (const p of parts.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, Json>;
  }
  cur[parts[parts.length - 1]!] = value;
}

async function translateMessages(targets: string[], model: string, apiKey: string | undefined, dry: boolean) {
  const en = JSON.parse(readFileSync(resolve("messages/en.json"), "utf8")) as Record<string, Json>;
  const flatEn = flatten(en);
  for (const t of targets) {
    const file = resolve(`messages/${t}.json`);
    const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Json>) : {};
    const flatExisting = flatten(existing);
    const missing = Object.fromEntries(Object.entries(flatEn).filter(([k]) => !(k in flatExisting)));
    console.log(`messages/${t}.json: ${Object.keys(missing).length} missing keys`);
    if (dry || !Object.keys(missing).length) continue;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
    const keys = Object.keys(missing);
    for (let i = 0; i < keys.length; i += 60) {
      const chunk = Object.fromEntries(keys.slice(i, i + 60).map((k) => [k, missing[k]!]));
      const out = await translateBatch(chunk, t, model, apiKey);
      for (const [k, v] of Object.entries(out)) if (typeof v === "string") setPath(existing, k, v);
      console.log(`  translated ${Math.min(i + 60, keys.length)}/${keys.length}`);
    }
    writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");
    if (!(LOCALES as readonly string[]).includes(t)) console.log(`  → add "${t}" to src/lib/i18n/locales.ts to enable it in the UI`);
  }
}

type I18nNode = Record<string, Record<string, Json>>;

/** Walks a YAML document and fills missing locales in every `i18n` map, marking them machine: true. */
async function translateContentFile(file: string, targets: string[], model: string, apiKey: string | undefined, dry: boolean) {
  const doc = parse(readFileSync(file, "utf8")) as Json;
  const jobs: Array<{ node: I18nNode; key: string; field: string; source: string; target: string }> = [];
  const walk = (node: Json) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const rec = node as Record<string, Json>;
    if (rec.i18n && typeof rec.i18n === "object" && !Array.isArray(rec.i18n)) {
      const i18n = rec.i18n as I18nNode;
      const src = i18n.en ?? i18n.cs;
      if (src) {
        for (const t of targets) {
          if (i18n[t]) continue;
          for (const field of ["text", "scenario", "title", "blurb", "share"]) {
            if (typeof src[field] === "string") jobs.push({ node: i18n, key: `${field}`, field, source: src[field] as string, target: t });
          }
        }
      }
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(doc);
  const byTarget = new Map<string, typeof jobs>();
  for (const j of jobs) byTarget.set(j.target, [...(byTarget.get(j.target) ?? []), j]);
  for (const [t, list] of byTarget) {
    console.log(`${file}: ${list.length} strings → ${t}`);
    if (dry) continue;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
    for (let i = 0; i < list.length; i += 60) {
      const chunk = list.slice(i, i + 60);
      const out = await translateBatch(Object.fromEntries(chunk.map((j, k) => [String(k), j.source])), t, model, apiKey);
      chunk.forEach((j, k) => {
        const v = out[String(k)];
        if (typeof v !== "string") return;
        j.node[t] ??= { machine: true };
        (j.node[t] as Record<string, Json>)[j.field] = v;
        (j.node[t] as Record<string, Json>).machine = true;
      });
    }
  }
  if (!dry && jobs.length) writeFileSync(file, stringify(doc, { lineWidth: 0 }));
}

async function main() {
  const to = arg("to");
  if (!to) throw new Error("usage: pnpm translate -- --to sk,de,pl [--messages] [--content] [--dry-run]");
  const targets = to.split(",").map((s) => s.trim()).filter(Boolean);
  const e = env();
  const dry = flag("dry-run");
  const doMessages = flag("messages") || !flag("content");
  const doContent = flag("content") || !flag("messages");
  if (doMessages) await translateMessages(targets, e.TRANSLATE_MODEL, e.ANTHROPIC_API_KEY, dry);
  if (doContent) {
    const { readdirSync } = await import("node:fs");
    const files = [...readdirSync(resolve("content/rounds")).map((f) => resolve("content/rounds", f)), resolve("content/contradictions.yaml"), resolve("content/archetypes.yaml"), resolve("content/titles.yaml")];
    for (const f of files) await translateContentFile(f, targets, e.TRANSLATE_MODEL, e.ANTHROPIC_API_KEY, dry);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
