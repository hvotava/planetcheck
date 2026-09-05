import { describe, expect, it } from "vitest";
import { buildRoundsCalendar, escapeText, foldLine, formatUtc } from "@/lib/calendar/ics";

const OPTS = {
  siteUrl: "https://example.org",
  locale: "cs",
  calendarName: "Přežijeme?",
  now: new Date("2026-09-05T10:00:00Z"),
};

const ROUNDS = [
  { slug: "2026-w38", title: "Voda", blurb: "Týden o tom, čeho je málo.", starts_at: "2026-09-14T06:00:00Z", ends_at: "2026-09-20T22:00:00Z" },
  { slug: "2026-w37", title: "Sousedé", starts_at: "2026-09-01T06:00:00Z", ends_at: "2026-09-13T22:00:00Z" },
];

describe("formatUtc", () => {
  it("writes the compact UTC form the spec wants", () => {
    expect(formatUtc(new Date("2026-09-14T06:00:00Z"))).toBe("20260914T060000Z");
  });
});

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Voda")).toBe("SUMMARY:Voda");
  });
  it("folds past 75 octets with a leading space on continuations", () => {
    const folded = foldLine("DESCRIPTION:" + "a".repeat(120));
    expect(folded).toContain("\r\n ");
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  });
  it("counts bytes, not characters, so accents cannot overflow a line", () => {
    const folded = foldLine("SUMMARY:" + "ě".repeat(60)); // 120 bytes
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  });
});

describe("buildRoundsCalendar", () => {
  const ics = buildRoundsCalendar(ROUNDS, OPTS);

  it("produces a calendar with one event per round, in start order", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    const uids = [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]!.trim());
    expect(uids).toEqual(["2026-w37@example.org", "2026-w38@example.org"]);
  });

  it("uses CRLF line endings throughout", () => {
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("carries the start, the end and a link to play", () => {
    expect(ics).toContain("DTSTART:20260914T060000Z");
    expect(ics).toContain("DTEND:20260920T220000Z");
    expect(ics).toContain("URL:https://example.org/cs/play");
    expect(ics).toContain("DTSTAMP:20260905T100000Z");
  });

  it("gives an open-ended round a default duration instead of a broken event", () => {
    const out = buildRoundsCalendar([{ slug: "anchor", title: "Kotvy", starts_at: "2026-01-01T00:00:00Z", ends_at: null }], { ...OPTS, openEndedHours: 24 });
    expect(out).toContain("DTSTART:20260101T000000Z");
    expect(out).toContain("DTEND:20260102T000000Z");
  });

  it("skips a round with an unusable date rather than emitting a corrupt calendar", () => {
    const out = buildRoundsCalendar([{ slug: "bad", title: "X", starts_at: "not-a-date", ends_at: null }], OPTS);
    expect(out).not.toContain("UID:bad@");
    expect(out).toContain("END:VCALENDAR");
  });

  it("escapes a title that contains a comma", () => {
    const out = buildRoundsCalendar([{ slug: "s", title: "Voda, oheň", starts_at: "2026-09-14T06:00:00Z", ends_at: null }], OPTS);
    expect(out).toContain("Voda\\, oheň");
  });
});
