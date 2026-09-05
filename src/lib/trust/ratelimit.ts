/**
 * Flood guard for /api/vote — the only place a request can be rejected for volume (429),
 * and only at abuse levels (default 30 requests / minute per ip hash). The policy limits
 * from ARCHITECTURE §6 (10/h per ip, 3/h per cookie) are *flags*, computed in submit_vote.
 *
 * Backends: Redis (REDIS_URL, e.g. Railway Redis) or an in-process fixed window.
 */
export type RateLimitResult = { allowed: boolean; count: number; limit: number; resetAt: number };

export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}

export function createMemoryLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let sweep = 0;
  return {
    async hit(key) {
      const now = Date.now();
      if (++sweep % 500 === 0) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      b.count++;
      return { allowed: b.count <= limit, count: b.count, limit, resetAt: b.resetAt };
    },
  };
}

type RedisLike = { incr(key: string): Promise<number>; pexpire(key: string, ms: number): Promise<unknown>; pttl(key: string): Promise<number> };

export function createRedisLimiter(redis: RedisLike, limit: number, windowMs: number, prefix = "pc:flood:"): RateLimiter {
  return {
    async hit(key) {
      const k = prefix + key;
      const count = await redis.incr(k);
      if (count === 1) await redis.pexpire(k, windowMs);
      const ttl = await redis.pttl(k);
      return { allowed: count <= limit, count, limit, resetAt: Date.now() + Math.max(0, ttl) };
    },
  };
}

type Global = typeof globalThis & { __planetcheck_limiter?: RateLimiter };

/** Process-wide limiter; Redis when REDIS_URL is set, memory otherwise. */
export async function getFloodLimiter(opts: { redisUrl?: string; limit?: number; windowMs?: number } = {}): Promise<RateLimiter> {
  const g = globalThis as Global;
  if (g.__planetcheck_limiter) return g.__planetcheck_limiter;
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  if (opts.redisUrl) {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(opts.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    await redis.connect().catch(() => undefined);
    const inner = createRedisLimiter(redis, limit, windowMs);
    const fallback = createMemoryLimiter(limit, windowMs);
    g.__planetcheck_limiter = {
      hit: (key) => inner.hit(key).catch(() => fallback.hit(key)), // Redis down → degrade, never block
    };
  } else {
    g.__planetcheck_limiter = createMemoryLimiter(limit, windowMs);
  }
  return g.__planetcheck_limiter;
}
