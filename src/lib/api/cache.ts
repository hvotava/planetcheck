type Entry = { at: number; value: Promise<unknown> };
type Global = typeof globalThis & { __planetcheck_memo?: Map<string, Entry> };
const g = globalThis as Global;

/** Tiny in-process TTL memo for server components (keeps hot pages off the DB without build-time prerendering). */
export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  g.__planetcheck_memo ??= new Map();
  const hit = g.__planetcheck_memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  g.__planetcheck_memo.set(key, { at: Date.now(), value });
  value.catch(() => g.__planetcheck_memo?.delete(key));
  return value;
}
