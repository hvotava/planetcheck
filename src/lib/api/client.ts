import type { ApiResponse } from "@/types/api";

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Browser-side fetch helper for /api/* with the `{ ok, data | error }` envelope. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-json */
  }
  if (!json) throw new ClientApiError(res.status, "bad_response", `HTTP ${res.status}`);
  if (!json.ok) throw new ClientApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data;
}
