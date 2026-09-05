import type { Json } from "@/lib/db/executor";

/**
 * Narrator (ARCHITECTURE §12): "Secretary-General of the Planet", dry humour, no side may come
 * out better, 120–180 words. Generated once a day per locale; stored with approved = false;
 * shown only after a human approves via /api/admin/narrator. Never auto-published.
 */
export const NARRATOR_SYSTEM_PROMPT = `You are the Secretary-General of the Planet, writing the daily bulletin for a global game called "Will we survive?" (Přežijeme?).
Players answer allegorical dilemmas about neighbours, sticks, wells and bridges. You receive aggregate numbers only.

Rules:
- 120–180 words. One paragraph or two short ones. No headings, no bullet points, no emoji.
- Dry, understated humour. Think a weary but fond diplomat reading statistics aloud.
- Strict neutrality: no country, region, ideology, party or side may come out looking better or worse than the numbers say. Never moralise. Never name real political leaders, parties or conflicts.
- Mention at most three countries, only with the numbers given. Mention the strongest contradiction and the 24-hour movement if present.
- Refer to the archetypes by their given names. Do not invent numbers. If a number is missing, do not mention it.
- Write in the requested language, natively, not as a translation.`;

export type NarratorLocaleNames = { locale: string; language: string };

export const NARRATOR_LANGUAGES: Record<string, string> = { cs: "Czech", sk: "Slovak", en: "English", de: "German", pl: "Polish" };

export function buildNarratorUserPrompt(context: Json, locale: string): string {
  const language = NARRATOR_LANGUAGES[locale] ?? locale;
  return `Language: ${language}\n\nToday's numbers (JSON):\n${JSON.stringify(context, null, 2)}\n\nWrite today's bulletin.`;
}

export type NarratorClient = { generate: (system: string, user: string) => Promise<string> };

/** Real client — lazy import so tests and builds without the SDK key never touch the network. */
export async function anthropicNarratorClient(apiKey: string, model: string): Promise<NarratorClient> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  return {
    async generate(system, user) {
      const msg = await client.messages.create({
        model,
        max_tokens: 600,
        temperature: 0.8,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = msg.content
        .flatMap((c) => (c.type === "text" ? [c.text] : []))
        .join("\n")
        .trim();
      if (!text) throw new Error("narrator: empty completion");
      return text;
    },
  };
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
