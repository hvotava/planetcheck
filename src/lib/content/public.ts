import { loadArchetypes, loadDuels, loadTitles } from "./loader";
import { pickLocalized } from "./i18n";
import type { ArchetypeMeta } from "@/components/ui/ArchetypeBadge";

/** Localised archetype + title metadata for the UI (server-side; content/ is the source). */
export function archetypeMeta(locale: string): Record<string, ArchetypeMeta> {
  const out: Record<string, ArchetypeMeta> = {};
  for (const a of loadArchetypes().archetypes) {
    if (out[a.key] || !a.i18n) continue;
    const l = pickLocalized(a.i18n, locale)?.value;
    out[a.key] = { key: a.key, title: l?.title ?? a.key, blurb: l?.blurb, share: l?.share, emoji: a.emoji, color: a.color };
  }
  return out;
}

export type TitleMeta = { key: string; title: string; blurb?: string; emoji?: string };

export function titleMeta(locale: string): Record<string, TitleMeta> {
  const out: Record<string, TitleMeta> = {};
  for (const t of loadTitles().titles) {
    const l = pickLocalized(t.i18n, locale)?.value;
    out[t.key] = { key: t.key, title: l?.title ?? t.key, blurb: l?.blurb, emoji: t.emoji };
  }
  return out;
}

export type DuelMeta = { key: string; a: string; b: string; title: string; blurb?: string };

/** Localised curated duels (content/duels.yaml is the source; codes are validated on load). */
export function duelMeta(locale: string): DuelMeta[] {
  return loadDuels().map((d) => {
    const l = pickLocalized(d.i18n, locale)?.value;
    return { key: d.key, a: d.a, b: d.b, title: l?.title ?? d.key, blurb: l?.blurb };
  });
}
