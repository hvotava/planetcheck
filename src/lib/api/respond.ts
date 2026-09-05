import { NextResponse } from "next/server";
import type { ApiErr, ApiOk } from "@/types/api";

/** CLAUDE.md convention: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`, HTTP status matching. */
export function ok<T>(data: T, init: { status?: number; cache?: number; headers?: Record<string, string> } = {}): NextResponse<ApiOk<T>> {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", init.cache ? `public, s-maxage=${init.cache}, stale-while-revalidate=${init.cache * 4}` : "private, no-store");
  return NextResponse.json({ ok: true, data }, { status: init.status ?? 200, headers });
}

export function fail(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): NextResponse<ApiErr> {
  const h = new Headers(headers);
  h.set("Cache-Control", "private, no-store");
  return NextResponse.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, { status, headers: h });
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Wraps a handler so thrown ApiErrors become well-formed responses and anything else a 500 without leaking internals. */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.code, e.message, e.details);
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, e);
      return fail(500, "internal", "Something went wrong on our side.");
    }
  };
}
