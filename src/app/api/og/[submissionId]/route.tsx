import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRepo } from "@/lib/db/server";
import { isUuid } from "@/lib/trust/fingerprint";
import { archetypeMeta } from "@/lib/content/public";
import { countryName } from "@/lib/countries";
import { flagEmoji } from "@/components/ui/Flag";
import { isLocale } from "@/lib/i18n/locales";
import { deepMerge } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_DIR = resolve(process.cwd(), "src/lib/og/fonts");
let fonts: Array<{ name: string; data: Buffer; weight: 400 | 700 }> | null = null;
function loadFonts() {
  fonts ??= [
    { name: "Inter", data: readFileSync(resolve(FONT_DIR, "Inter-Regular.ttf")), weight: 400 },
    { name: "Inter", data: readFileSync(resolve(FONT_DIR, "Inter-Bold.ttf")), weight: 700 },
    { name: "Space Grotesk", data: readFileSync(resolve(FONT_DIR, "SpaceGrotesk-Bold.ttf")), weight: 700 },
  ];
  return fonts;
}

const svgCache = new Map<string, string>();
function archetypeDataUri(key: string): string | null {
  if (svgCache.has(key)) return svgCache.get(key)!;
  try {
    const svg = readFileSync(resolve(process.cwd(), "public/archetypes", `${key.replace(/[^a-z_]/g, "")}.svg`), "utf8");
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    svgCache.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}

async function messages(locale: string): Promise<Record<string, Record<string, string>>> {
  const en = (await import("../../../../../messages/en.json")).default as unknown as Record<string, Record<string, string>>;
  if (locale === "en") return en;
  const own = (await import(`../../../../../messages/${locale}.json`)).default as unknown as Record<string, Record<string, string>>;
  return deepMerge(en, own) as Record<string, Record<string, string>>;
}

/** GET /api/og/:submissionId?locale=cs → 1200×630 PNG share card (ARCHITECTURE §13). Cached a day on the CDN. */
export async function GET(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;
  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale") ?? "en";
  const locale = isLocale(localeParam) ? localeParam : "en";
  if (!isUuid(submissionId)) return new Response("not found", { status: 404 });
  const repo = await getRepo();
  const s = await repo.getSubmission(submissionId);
  if (!s) return new Response("not found", { status: 404 });

  const m = await messages(locale);
  const meta = archetypeMeta(locale)[s.archetype];
  const you = Math.round(s.survival * 100);
  const planet = s.planet?.survival_weighted == null ? null : Math.round(s.planet.survival_weighted);
  const planetLine = (m.og?.planetLine ?? "The planet survives at {pct}%").replace("{pct}", planet == null ? "–" : String(planet));
  const youLine = (m.og?.youLine ?? "You: {pct}%").replace("{pct}", String(you));
  const youAre = m.result?.youAre ?? "You are";
  const appName = m.common?.appName ?? "Will we survive?";
  const country = s.country_code ? countryName(s.country_code, locale) : null;
  const illustration = archetypeDataUri(s.archetype);
  const color = meta?.color ?? "#3dffa0";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          backgroundColor: "#070a10",
          backgroundImage: `radial-gradient(circle at 20% 10%, ${color}33 0%, #070a10 55%)`,
          color: "#e9edf5",
          fontFamily: "Inter",
          padding: 56,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#8f9ab0" }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#3dffa0" }} />
            {appName}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 30, color: "#8f9ab0" }}>{youAre}</div>
            <div style={{ fontSize: 84, fontFamily: "Space Grotesk", fontWeight: 700, lineHeight: 1, color }}>
              {meta?.title ?? s.archetype}
            </div>
            {meta?.blurb ? <div style={{ fontSize: 26, color: "#b9c2d3", maxWidth: 640, lineHeight: 1.3 }}>{meta.blurb}</div> : null}
          </div>
          <div style={{ display: "flex", gap: 40, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 24, color: "#8f9ab0" }}>{planetLine}</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: "#3dffa0" }}>{youLine}</div>
            </div>
            {country ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, color: "#b9c2d3", paddingBottom: 8 }}>
                <span>{flagEmoji(s.country_code)}</span>
                {country}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 400 }}>
          {illustration ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={illustration} width={360} height={360} alt="" style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))" }} />
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: loadFonts(),
      emoji: "twemoji",
      headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
