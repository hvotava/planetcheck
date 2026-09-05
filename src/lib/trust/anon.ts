import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { isUuid } from "./fingerprint";

export const ANON_COOKIE = "pc_anon";
export const SESSION_COOKIE = "pc_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The anonymous identity lives in an httpOnly cookie the browser can neither read nor forge. */
export function readAnonId(req: NextRequest): { anonId: string; isNew: boolean } {
  const v = req.cookies.get(ANON_COOKIE)?.value;
  if (isUuid(v)) return { anonId: v.toLowerCase(), isNew: false };
  return { anonId: randomUUID(), isNew: true };
}

export function setAnonCookie(res: NextResponse, anonId: string, secure: boolean): void {
  res.cookies.set({ name: ANON_COOKIE, value: anonId, httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: ONE_YEAR });
}

export function setSessionCookie(res: NextResponse, sessionId: string, secure: boolean): void {
  res.cookies.set({ name: SESSION_COOKIE, value: sessionId, httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: ONE_YEAR });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
