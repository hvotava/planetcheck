import type { ArchetypeRule, ScoringRound } from "@/types/domain";

/** Small synthetic round: 3 choice questions, 1 meta, 2 contradiction pairs. */
export const ROUND: ScoringRound = {
  survival_weights: { consistency: 0.4, compromise: 0.35, realism: 0.25 },
  questions: [
    {
      key: "field",
      type: "choice",
      options: [
        { key: "un", axis_weights: { peace_force: -1, trust_paranoia: 1 }, compromise: true, honeypot: false },
        { key: "cousin", axis_weights: { peace_force: 1, us_them: 1 }, compromise: false, honeypot: false },
        { key: "fence", axis_weights: { peace_force: 0, trust_paranoia: -0.5 }, compromise: false, honeypot: false },
        { key: "moon", axis_weights: {}, compromise: false, honeypot: true },
      ],
    },
    {
      key: "stick",
      type: "choice",
      options: [
        { key: "believe", axis_weights: { trust_paranoia: -0.8 }, compromise: false, honeypot: false },
        { key: "bigger", axis_weights: { peace_force: 0.6, trust_paranoia: 0.6 }, compromise: false, honeypot: false },
        { key: "treaty", axis_weights: { peace_force: -0.6, trust_paranoia: 0.2 }, compromise: true, honeypot: false },
      ],
    },
    {
      key: "weapon",
      type: "choice",
      options: [
        { key: "buy", axis_weights: { peace_force: 0.8, trust_paranoia: 0.6 }, compromise: false, honeypot: false },
        { key: "promise", axis_weights: { peace_force: -0.8, trust_paranoia: -0.5 }, compromise: true, honeypot: false },
        { key: "alliance", axis_weights: { peace_force: -0.2, us_them: -0.6 }, compromise: true, honeypot: false },
      ],
    },
    { key: "field_meta", type: "meta", options: [] },
  ],
  contradictions: [
    { key: "treaty_but_buy", a: { question: "stick", option: "treaty" }, b: { question: "weapon", option: "buy" } },
    { key: "un_but_cousin", a: { question: "field", option: "un" }, b: { question: "weapon", option: "buy" } },
  ],
};

export const RULES: ArchetypeRule[] = [
  { key: "svycar", when: { abs_all_axes_below: 0.2 } },
  { key: "holubice", when: { peace_force: { lt: -0.4 }, trust_paranoia: { lt: 0 } } },
  { key: "jestrab", when: { peace_force: { gt: 0.4 } } },
  { key: "diplomat", when: { compromise: { gt: 0.5 } } },
  { key: "strejda", when: { realism: { lt: 0.4 }, us_them: { gt: 0.3 } } },
  { key: "strejda", when: {} },
];
