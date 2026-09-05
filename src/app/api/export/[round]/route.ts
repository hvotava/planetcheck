import { getRepo } from "@/lib/db/server";
import { roundBySlugOrCurrent } from "@/lib/api/rounds";
import { handle, ok } from "@/lib/api/respond";
import { loadWeighting } from "@/lib/content/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportRow = { question_key: string; option_key: string; country_code: string; trust: string; raw: number; weighted: number };

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/export/:round[.csv] — aggregates only, countries below the sample threshold folded into "--". */
export const GET = handle(async (req, ctx: { params: Promise<{ round: string }> }) => {
  const { round: param } = await ctx.params;
  const wantCsv = param.endsWith(".csv") || new URL(req.url).searchParams.get("format") === "csv";
  const slug = param.replace(/\.(csv|json)$/, "");
  const round = await roundBySlugOrCurrent(slug === "current" ? null : slug);
  const repo = await getRepo();
  const data = (await repo.exportRound(round.id, loadWeighting().min_country_submissions)) as { options_by_country: ExportRow[] } & Record<string, unknown>;
  if (!wantCsv) return ok(data, { cache: 300, headers: { "Content-Disposition": `inline; filename="planetcheck-${round.slug}.json"` } });
  const header = ["round", "question_key", "option_key", "country_code", "trust", "raw", "weighted"];
  const lines = [header.join(","), ...data.options_by_country.map((r) => [round.slug, r.question_key, r.option_key, r.country_code, r.trust, r.raw, r.weighted].map(csvEscape).join(","))];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="planetcheck-${round.slug}.csv"`,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1200",
    },
  });
});
