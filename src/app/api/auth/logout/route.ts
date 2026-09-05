import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/trust/anon";

export const runtime = "nodejs";

/** POST /api/auth/logout — drops the session cookie (the anonymous cookie stays; votes are not deleted). */
export async function POST() {
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } });
  clearSessionCookie(res);
  return res;
}
