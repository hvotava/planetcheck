import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Confirmation and unsubscribe tokens. The plaintext token exists only long enough to be put
 * into one email; the database stores the hash, so a leaked dump cannot be used to confirm or
 * unsubscribe anyone. Same shape as `hashSubject` in the trust layer.
 */

export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:newsletter:${token}`).digest("hex");
}

/**
 * The unsubscribe link. Derived from the row id rather than stored, so there is no token in
 * the database to leak, and every email can carry a working link without us keeping one.
 * Shape: "<id>.<mac>".
 */
export function unsubscribeToken(id: string, secret: string): string {
  return `${id}.${createHmac("sha256", secret).update(`unsub:${id}`).digest("base64url")}`;
}

/** Verifies an unsubscribe token and returns the row id it names, or null. */
export function readUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return tokensMatch(token.slice(dot + 1), createHmac("sha256", secret).update(`unsub:${id}`).digest("base64url")) ? id : null;
}

/** Constant-time compare for two strings of equal length. */
export function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Conservative address check. Deliberately not a full RFC 5322 parser: this only has to reject
 * obvious rubbish before we spend a send on it, and the confirmation link is the real proof
 * that the address exists and belongs to whoever asked.
 */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@,;:<>"'\\]+@[^\s@.,;:<>"'\\]+(\.[^\s@.,;:<>"'\\]+)+$/.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}
