import { createHash } from "node:crypto";

/**
 * Anonymous-layer fingerprint helpers (ARCHITECTURE §7, CLAUDE.md rule 2).
 * We never store a raw IP or a User-Agent string: only sha256(IP_SALT + ip) and a coarse browser family.
 * Pure functions.
 */

export function hashIp(ip: string | null, salt: string): string {
  return createHash("sha256").update(`${salt}${ip ?? "unknown"}`).digest("hex");
}

export function hashSubject(provider: string, subject: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${provider}:${subject}`).digest("hex");
}

/** Client IP from proxy headers (Cloudflare first). Never logged, only hashed. */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return null;
}

/** ISO-3166 alpha-2 from Cloudflare; unknown/tor/private sentinels → null. */
export function geoCountry(headers: Headers): string | null {
  const raw = (headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw) || raw === "XX" || raw === "T1") return null;
  return raw;
}

export type UaFamily = "mobile-safari" | "chrome-mobile" | "samsung" | "chrome" | "firefox" | "safari" | "edge" | "bot" | "other";

/** Coarse browser family — enough for abuse heuristics, useless for tracking. */
export function uaFamily(ua: string | null): UaFamily {
  if (!ua) return "other";
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview|fetch|curl|wget|python-requests/.test(s)) return "bot";
  if (/edg\//.test(s)) return "edge";
  if (/samsungbrowser/.test(s)) return "samsung";
  if (/firefox|fxios/.test(s)) return "firefox";
  if (/(iphone|ipad|ipod).*safari/.test(s) && !/crios|chrome/.test(s)) return "mobile-safari";
  if (/android.*chrome|crios/.test(s)) return "chrome-mobile";
  if (/chrome|chromium/.test(s)) return "chrome";
  if (/safari/.test(s)) return "safari";
  return "other";
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
