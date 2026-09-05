import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { finishAuth, isProvider } from "@/lib/auth/oauth";
import { hashSubject } from "@/lib/trust/fingerprint";
import { readAnonId, setAnonCookie, setSessionCookie } from "@/lib/trust/anon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth callback → link_auth_user (ARCHITECTURE §7): binds the cookie identity to the hashed
 * subject, upgrades past submissions to `verified`, sets the session cookie.
 * Apple posts the callback (response_mode=form_post); Google uses GET.
 */
async function handle(req: NextRequest, provider: string) {
  const e = env();
  const nreq = req;
  const locale = nreq.cookies.get("pc_oauth_locale")?.value ?? "en";
  const back = (q: string) => NextResponse.redirect(new URL(`/${locale}/verify?${q}`, e.NEXT_PUBLIC_SITE_URL));
  if (!isProvider(provider)) return back("error=provider");
  let code: string | null;
  let state: string | null;
  if (req.method === "POST") {
    const form = await req.formData();
    code = String(form.get("code") ?? "");
    state = String(form.get("state") ?? "");
  } else {
    const u = new URL(req.url);
    code = u.searchParams.get("code");
    state = u.searchParams.get("state");
  }
  const expected = nreq.cookies.get("pc_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return back("error=state");
  try {
    const subject = await finishAuth(provider, code, nreq.cookies.get("pc_oauth_verifier")?.value ?? null);
    const { anonId } = readAnonId(nreq);
    const repo = await getRepo();
    const link = await repo.linkAuthUser({ anon_id: anonId, provider, subject_hash: hashSubject(provider, subject, e.AUTH_SECRET) });
    const res = back("done=1");
    const secure = e.NODE_ENV === "production";
    setAnonCookie(res, anonId, secure);
    setSessionCookie(res, link.session_id, secure);
    for (const c of ["pc_oauth_state", "pc_oauth_verifier", "pc_oauth_locale"]) res.cookies.set({ name: c, value: "", maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[auth] callback failed:", err);
    return back("error=exchange");
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  return handle(req, provider);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  return handle(req, provider);
}
