export type TurnstileResult = { ok: true } | { ok: false; reason: "failed" | "unavailable" | "missing" };

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile token. Policy (ARCHITECTURE §6): always verify;
 * if Cloudflare is unreachable, accept the vote and flag `turnstile_unavailable`.
 * No secret configured (local dev) counts as unavailable, never as a pass.
 */
export async function verifyTurnstile(token: string | null | undefined, secret: string | undefined, ip: string | null, fetchImpl: typeof fetch = fetch): Promise<TurnstileResult> {
  if (!secret) return { ok: false, reason: "unavailable" };
  if (!token) return { ok: false, reason: "missing" };
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: ctl.signal });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json = (await res.json()) as { success?: boolean };
    return json.success ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
