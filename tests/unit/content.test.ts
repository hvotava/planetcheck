import { describe, expect, it } from "vitest";
import { loadContent, loadRounds } from "@/lib/content/loader";
import { pickLocalized } from "@/lib/content/i18n";

describe("content/ validates and links", () => {
  const bundle = loadContent();

  it("loads both rounds with anchors expanded", () => {
    const weekly = bundle.rounds.find((r) => r.slug === "2026-w37")!;
    expect(weekly).toBeTruthy();
    expect(weekly.questions.filter((q) => q.type === "choice")).toHaveLength(7);
    expect(weekly.questions.filter((q) => q.type === "meta")).toHaveLength(2);
    expect(weekly.questions.filter((q) => q.anchor).map((q) => q.key)).toContain("neighbor_field");
    // exactly one honeypot
    expect(weekly.questions.flatMap((q) => q.options.filter((o) => o.honeypot))).toHaveLength(1);
    // meta after target
    const meta = weekly.questions.find((q) => q.key === "neighbor_field_meta")!;
    const target = weekly.questions.find((q) => q.key === "neighbor_field")!;
    expect(meta.position).toBeGreaterThan(target.position);
    // positions unique + ordered
    const pos = weekly.questions.map((q) => q.position);
    expect(new Set(pos).size).toBe(pos.length);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });

  it("attaches only contradiction pairs whose both questions are in the round", () => {
    const weekly = bundle.rounds.find((r) => r.slug === "2026-w37")!;
    const keys = weekly.contradictions.map((c) => c.key).sort();
    expect(keys).toEqual(["open_door_closed_bridge", "small_sticks_secret_weapon", "un_for_me_force_for_them", "un_judge_but_boats_decide"]);
    const anchor = bundle.rounds.find((r) => r.slug === "anchor")!;
    expect(anchor.contradictions.map((c) => c.key)).toEqual(["shared_pipe_upstream_dam", "test_the_water_spread_the_rumor"].filter((k) => k !== "shared_pipe_upstream_dam"));
  });

  it("every option has cs and en text and weights within bounds", () => {
    for (const r of bundle.rounds)
      for (const q of r.questions) {
        expect(q.i18n.cs?.text).toBeTruthy();
        expect(q.i18n.en?.text).toBeTruthy();
        for (const o of q.options) {
          expect(o.i18n.cs?.text).toBeTruthy();
          expect(o.i18n.en?.text).toBeTruthy();
          for (const v of Object.values(o.axis_weights)) expect(Math.abs(v!)).toBeLessThanOrEqual(1);
        }
      }
  });

  it("archetypes end with a fallback and weighting params match ARCHITECTURE §9", () => {
    const last = bundle.archetypes.archetypes.at(-1)!;
    expect(last.when).toEqual({});
    expect(bundle.weighting.country_clamp).toEqual([0.2, 5]);
    expect(bundle.weighting.min_country_submissions).toBe(30);
    expect(bundle.weighting.min_demographic_submissions).toBe(200);
    expect(bundle.weighting.max_iterations).toBe(10);
    expect(bundle.weighting.tolerance).toBe(0.01);
  });

  it("rejects a round with two honeypots", () => {
    expect(() => loadRounds("tests/unit/fixtures/bad-content")).toThrow(/honeypot/);
  });
});

describe("pickLocalized", () => {
  const i18n = { cs: { text: "Ahoj" }, en: { text: "Hi" }, de: { text: "Hallo", machine: true } };
  it("returns the locale when present", () => {
    expect(pickLocalized(i18n, "de")).toMatchObject({ value: { text: "Hallo" }, fallback: false });
  });
  it("gates unreviewed machine translations of sensitive questions to English", () => {
    expect(pickLocalized(i18n, "de", true)).toMatchObject({ value: { text: "Hi" }, locale: "en", fallback: true });
    expect(pickLocalized({ ...i18n, de: { text: "Hallo", machine: true, reviewed: true } }, "de", true)).toMatchObject({ locale: "de", fallback: false });
  });
  it("falls back to en, then cs", () => {
    expect(pickLocalized(i18n, "pl")).toMatchObject({ locale: "en", fallback: true });
    expect(pickLocalized({ cs: { text: "jen česky" } }, "pl")).toMatchObject({ locale: "cs" });
  });
});
