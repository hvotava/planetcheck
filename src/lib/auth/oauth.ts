import "server-only";
import { Apple, Google, generateCodeVerifier, generateState, decodeIdToken } from "arctic";
import { env } from "@/lib/env";

/**
 * Verified layer (ARCHITECTURE §7) without Supabase Auth: OAuth via `arctic`.
 * We read exactly one claim from the id token — the stable subject id — hash it with
 * AUTH_SECRET and forget it. No email, no name, no picture is ever requested or stored.
 */
export type Provider = "google" | "apple";

export function isProvider(v: string): v is Provider {
  return v === "google" || v === "apple";
}

export function providerAvailable(p: Provider): boolean {
  const e = env();
  return p === "google" ? !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) : !!(e.APPLE_CLIENT_ID && e.APPLE_TEAM_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY);
}

function redirectUri(p: Provider): string {
  return `${env().NEXT_PUBLIC_SITE_URL}/api/auth/${p}/callback`;
}

export function googleClient(): Google {
  const e = env();
  return new Google(e.GOOGLE_CLIENT_ID!, e.GOOGLE_CLIENT_SECRET!, redirectUri("google"));
}

export function appleClient(): Apple {
  const e = env();
  const pem = e.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const key = new Uint8Array(Buffer.from(pem, "base64"));
  return new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, key, redirectUri("apple"));
}

export type AuthStart = { url: URL; state: string; codeVerifier: string | null };

export function startAuth(p: Provider): AuthStart {
  const state = generateState();
  if (p === "google") {
    const codeVerifier = generateCodeVerifier();
    // "openid" only: we do not ask for email or profile.
    const url = googleClient().createAuthorizationURL(state, codeVerifier, ["openid"]);
    return { url, state, codeVerifier };
  }
  const url = appleClient().createAuthorizationURL(state, []);
  return { url, state, codeVerifier: null };
}

/** Exchanges the code and returns the provider's stable subject id (never persisted raw). */
export async function finishAuth(p: Provider, code: string, codeVerifier: string | null): Promise<string> {
  const tokens = p === "google" ? await googleClient().validateAuthorizationCode(code, codeVerifier ?? "") : await appleClient().validateAuthorizationCode(code);
  const claims = decodeIdToken(tokens.idToken()) as { sub?: string };
  if (!claims.sub) throw new Error("id token without subject");
  return claims.sub;
}
