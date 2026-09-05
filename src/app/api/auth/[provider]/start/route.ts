import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isProvider, providerAvailable, startAuth } from "@/lib/auth/oauth";
import { fail } from "@/lib/api/respond";
import { isLocale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/:provider/start?locale=cs → redirect to the provider. State + PKCE live in short httpOnly cookies. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return fail(404, "unknown_provider", "Unknown provider.");
  if (!providerAvailable(provider)) return fail(503, "provider_unavailable", "This sign-in method is not configured.");
  const localeParam = new URL(req.url).searchParams.get("locale") ?? "en";
  const locale = isLocale(localeParam) ? localeParam : "en";
  const { url, state, codeVerifier } = startAuth(provider);
  const res = NextResponse.redirect(url);
  const secure = env().NODE_ENV === "production";
  const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  res.cookies.set({ name: "pc_oauth_state", value: state, ...opts });
  res.cookies.set({ name: "pc_oauth_locale", value: locale, ...opts });
  if (codeVerifier) res.cookies.set({ name: "pc_oauth_verifier", value: codeVerifier, ...opts });
  return res;
}
