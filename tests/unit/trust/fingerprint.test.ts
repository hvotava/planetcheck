import { describe, expect, it } from "vitest";
import { clientIp, geoCountry, hashIp, uaFamily, isUuid } from "@/lib/trust/fingerprint";
import { createMemoryLimiter } from "@/lib/trust/ratelimit";
import { verifyTurnstile } from "@/lib/trust/turnstile";

describe("fingerprint", () => {
  it("hashes ip with the salt and never returns the ip", () => {
    const h = hashIp("203.0.113.9", "salt");
    expect(h).toHaveLength(64);
    expect(h).not.toContain("203");
    expect(hashIp("203.0.113.9", "salt")).toBe(h);
    expect(hashIp("203.0.113.9", "other")).not.toBe(h);
  });
  it("reads the client ip from Cloudflare first", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBeNull();
  });
  it("normalises cf-ipcountry", () => {
    expect(geoCountry(new Headers({ "cf-ipcountry": "cz" }))).toBe("CZ");
    expect(geoCountry(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(geoCountry(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(geoCountry(new Headers())).toBeNull();
  });
  it("classifies user agents coarsely", () => {
    expect(uaFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("mobile-safari");
    expect(uaFamily("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")).toBe("chrome-mobile");
    expect(uaFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("edge");
    expect(uaFamily("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0")).toBe("firefox");
    expect(uaFamily("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("bot");
    expect(uaFamily(null)).toBe("other");
  });
  it("validates uuids", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("nope")).toBe(false);
  });
});

describe("flood limiter", () => {
  it("allows up to the limit in a window and then blocks", async () => {
    const l = createMemoryLimiter(3, 60_000);
    expect((await l.hit("a")).allowed).toBe(true);
    expect((await l.hit("a")).allowed).toBe(true);
    expect((await l.hit("a")).allowed).toBe(true);
    expect((await l.hit("a")).allowed).toBe(false);
    expect((await l.hit("b")).allowed).toBe(true);
  });
});

describe("turnstile policy", () => {
  it("no secret → unavailable (never a pass)", async () => {
    expect(await verifyTurnstile("tok", undefined, null)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("missing token → missing", async () => {
    expect(await verifyTurnstile(null, "secret", null)).toEqual({ ok: false, reason: "missing" });
  });
  it("cloudflare says no → failed; network error → unavailable", async () => {
    const no = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "secret", "1.1.1.1", no)).toEqual({ ok: false, reason: "failed" });
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "secret", null, boom)).toEqual({ ok: false, reason: "unavailable" });
    const yes = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "secret", null, yes)).toEqual({ ok: true });
  });
});
