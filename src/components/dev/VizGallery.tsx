"use client";

import { useMemo, useState } from "react";
import type { ArchetypeMeta } from "@/components/ui/ArchetypeBadge";
import { Dual } from "@/components/ui/Dual";
import { ArchetypeDonut } from "@/components/viz/ArchetypeDonut";
import { AxisBars } from "@/components/viz/AxisBars";
import { ContradictionMeter } from "@/components/viz/ContradictionMeter";
import { CountryBoard, type BoardCountry } from "@/components/viz/CountryBoard";
import { DuelBoard } from "@/components/viz/DuelBoard";
import { Ekg } from "@/components/viz/Ekg";
import { RulerSwitch } from "@/components/viz/RulerSwitch";
import { TrendLine } from "@/components/viz/TrendLine";
import { TwoCamps } from "@/components/viz/TwoCamps";
import { WorldMap } from "@/components/viz/WorldMap";
import type { TitleMeta } from "@/lib/content/public";
import { compareCountries, type DuelSideInput } from "@/lib/duel/compare";
import type { ResultsFilterPayload } from "@/types/api";

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

const SAMPLE_COUNTRIES: Array<[string, string, string]> = [
  ["CZ", "203", "Česko"], ["SK", "703", "Slovensko"], ["DE", "276", "Německo"], ["PL", "616", "Polsko"], ["FR", "250", "Francie"], ["US", "840", "USA"],
  ["BR", "076", "Brazílie"], ["IN", "356", "Indie"], ["JP", "392", "Japonsko"], ["NG", "566", "Nigérie"], ["AU", "036", "Austrálie"], ["CA", "124", "Kanada"],
  ["ES", "724", "Španělsko"], ["IT", "380", "Itálie"], ["MX", "484", "Mexiko"], ["ZA", "710", "JAR"], ["KR", "410", "Korea"], ["SE", "752", "Švédsko"],
];

export function VizGallery({ archetypes, titles, codes }: { archetypes: Record<string, ArchetypeMeta>; titles: Record<string, TitleMeta>; codes: Record<string, string> }) {
  const [filter, setFilter] = useState<ResultsFilterPayload>({});
  const data = useMemo(() => {
    const rand = seeded(42);
    const points = Array.from({ length: 60 }, (_, i) => Math.round(8 + 6 * Math.sin(i / 4) + rand() * 6));
    const board: BoardCountry[] = SAMPLE_COUNTRIES.map(([code, , name], i) => {
      const n = Math.round(rand() * 1400);
      const unlocked = n >= 500;
      return { code, name, survival_index: unlocked ? 45 + rand() * 40 : null, contradiction_index: unlocked ? rand() * 40 : null, submissions_count: n, unlocked, insufficient_sample: n < 30, top_archetype: Object.keys(archetypes)[i % 5] ?? null, titles: [], rank: null };
    });
    board.filter((c) => c.unlocked).sort((a, b) => (b.survival_index ?? 0) - (a.survival_index ?? 0)).forEach((c, i) => (c.rank = i + 1));
    const tk = Object.keys(titles);
    board.filter((c) => c.unlocked).forEach((c, i) => c.titles.push(...tk.slice(i * 2, i * 2 + 2)));
    const trend = Array.from({ length: 48 }, (_, i) => ({ at: new Date(Date.now() - (48 - i) * 600_000).toISOString(), survival_weighted: 58 + Math.sin(i / 6) * 4 + rand() * 2, survival_raw: 56 + Math.sin(i / 6) * 4 + rand() * 2, votes_total: i * 120 }));
    return { points, board, trend };
  }, [archetypes, titles]);

  const shares = Object.fromEntries(Object.keys(archetypes).map((k, i) => [k, { raw: 100 - i * 15, weighted: 100 - i * 14, share_raw: 30 - i * 5, share_weighted: 32 - i * 5 }]));
  const map = data.board.map((c) => ({ code: c.code, name: c.name, survival_index: c.survival_index, unlocked: c.unlocked, submissions_count: c.submissions_count }));
  const camps = {
    question: "Soused ti zabral pole. Co uděláš?",
    options: [
      { key: "un", text: "Zavolám OSN", icon: "🏛️", share_weighted: 41, share_raw: 38, raw: 380 },
      { key: "cousin", text: "Zavolám bratrance s traktorem", icon: "🚜", share_weighted: 33, share_raw: 36, raw: 360 },
      { key: "fence", text: "Postavím plot a dělám, že nic", icon: "🪵", share_weighted: 26, share_raw: 26, raw: 260 },
    ],
  };
  const pairs = [
    { key: "a", title: "Svět bez klacků, ale s mojí tajnou zbraní", share_weighted: 23, share_raw: 25 },
    { key: "b", title: "OSN pro moje pole, síla pro jejich úrodu", share_weighted: 14, share_raw: 15 },
    { key: "c", title: "Cizince do postele, most s druhým břehem ne", share_weighted: 9, share_raw: 8 },
  ];

  // synthetic duel: CZ leans to the treaty, SK to the bigger stick
  const duelSide = (code: string, field: [number, number, number], stick: [number, number, number], axes: [number, number, number]): DuelSideInput => ({
    code,
    live_count: 640,
    stats: {
      submissions_count: 640,
      unlocked: true,
      survival_index: code === "CZ" ? 61.4 : 55.8,
      contradiction_index: code === "CZ" ? 24 : 31,
      realism_mean: code === "CZ" ? 0.52 : 0.47,
      axis_means: { weighted: { peace_force: axes[0], trust_paranoia: axes[1], us_them: axes[2] }, raw: { peace_force: axes[0], trust_paranoia: axes[1], us_them: axes[2] } },
      top_archetype: code === "CZ" ? "diplomat" : "jestrab",
      titles: [],
    },
    questions: [
      { key: "neighbor_field", position: 1, options: ["un", "cousin", "fence"].map((k, i) => ({ key: k, icon: ["🏛️", "🚜", "🪵"][i]!, share_raw: field[i]!, share_weighted: field[i]! })) },
      { key: "bigger_stick", position: 2, options: ["believe", "bigger", "treaty"].map((k, i) => ({ key: k, icon: ["🐻", "🏏", "🤝"][i]!, share_raw: stick[i]!, share_weighted: stick[i]! })) },
    ],
  });
  const duel = compareCountries(
    duelSide("CZ", [46, 21, 33], [28, 24, 48], [-0.18, 0.12, -0.31]),
    duelSide("SK", [29, 44, 27], [19, 51, 30], [0.34, 0.28, 0.22]),
  );
  const duelTexts = {
    names: { CZ: "Česko", SK: "Slovensko" },
    questions: { neighbor_field: "Soused ti zabral pole. Co uděláš?", bigger_stick: "Soused si koupil velký klacek. Co ty?" },
    options: {
      "neighbor_field.un": "Zavolám OSN",
      "neighbor_field.cousin": "Zavolám bratrance s traktorem",
      "neighbor_field.fence": "Postavím plot a dělám, že nic",
      "bigger_stick.believe": "Věřím mu, medvědi tu fakt jsou",
      "bigger_stick.bigger": "Koupím si větší klacek",
      "bigger_stick.treaty": "Oba jen malé klacky. Svůj zahodím první.",
    },
  };

  const block = (title: string, el: React.ReactNode) => (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-sm text-accent">{title}</h2>
      {el}
    </section>
  );

  return (
    <div>
      {block("Ekg", <Ekg points={data.points} perMin={14} votesTotal={12345} survival={{ raw: 58.2, weighted: 61.4 }} live flash />)}
      {block("Dual", <div className="card flex gap-8 p-4"><Dual weighted={61.4} raw={58.2} size="xl" /><Dual weighted={12} raw={10} size="md" /><Dual weighted={null} raw={null} size="sm" /></div>)}
      {block("TwoCamps", <TwoCamps question={camps.question} options={camps.options} highlight="cousin" total={1000} />)}
      {block("WorldMap", <WorldMap countries={map} codes={codes} threshold={500} />)}
      {block("ContradictionMeter", <ContradictionMeter value={{ raw: 27, weighted: 24 }} pairs={pairs} />)}
      {block("ArchetypeDonut", <ArchetypeDonut shares={shares} meta={archetypes} />)}
      {block("AxisBars", <div className="card p-5"><AxisBars you={{ peace_force: -0.42, trust_paranoia: 0.1, us_them: -0.6 }} compare={{ peace_force: 0.05, trust_paranoia: 0.2, us_them: 0.1 }} compareLabel="Planeta" /></div>)}
      {block("RulerSwitch", <RulerSwitch value={filter} onChange={setFilter} />)}
      {block("TrendLine", <TrendLine points={data.trend} />)}
      {block("CountryBoard", <CountryBoard countries={data.board} threshold={500} archetypes={archetypes} titles={titles} highlight="CZ" />)}
      {block("DuelBoard", <DuelBoard duel={duel} texts={duelTexts} />)}
      {block("DuelBoard (not enough votes)", <DuelBoard duel={compareCountries(duelSide("CZ", [46, 21, 33], [28, 24, 48], [-0.18, 0.12, -0.31]), { code: "SK", live_count: 0, stats: null, questions: [] })} texts={duelTexts} />)}
    </div>
  );
}
