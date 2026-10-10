/**
 * In-memory sliding-window rate limiter for protecting ML investigation & computation endpoints.
 */

export interface RateLimitOptions {
  /** Maximum allowed requests within the time window (default: 60) */
  maxRequests?: number;
  /** Duration of the sliding window in milliseconds (default: 60,000ms / 1 min) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // UNIX epoch timestamp in milliseconds
  headers: Record<string, string>;
}

interface WindowBucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly defaultLimit: number;
  private readonly defaultWindowMs: number;
  private readonly store = new Map<string, WindowBucket>();
  private lastCleanup = Date.now();

  constructor(options: RateLimitOptions = {}) {
    this.defaultLimit = options.maxRequests ?? 60;
    this.defaultWindowMs = options.windowMs ?? 60_000;
  }

  /**
   * Evaluates if a request from the given client key is permitted.
   */
  public check(clientKey: string, customOptions?: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const limit = customOptions?.maxRequests ?? this.defaultLimit;
    const windowMs = customOptions?.windowMs ?? this.defaultWindowMs;

    this.maybeCleanup(now, windowMs);

    let bucket = this.store.get(clientKey);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.store.set(clientKey, bucket);
    }

    // Filter out timestamps outside the active sliding window
    const threshold = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((t) => t > threshold);

    const currentCount = bucket.timestamps.length;
    const allowed = currentCount < limit;

    if (allowed) {
      bucket.timestamps.push(now);
    }

    const remaining = Math.max(0, limit - (allowed ? currentCount + 1 : currentCount));
    const oldestTimestamp = bucket.timestamps[0] ?? now;
    const resetTime = oldestTimestamp + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetTime - now) / 1000));

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
    };

    if (!allowed) {
      headers['Retry-After'] = String(retryAfterSec);
    }

    return {
      allowed,
      limit,
      remaining,
      resetTime,
      headers,
    };
  }

  /**
   * Resets the rate limit bucket for a client key (useful for tests).
   */
  public reset(clientKey?: string): void {
    if (clientKey) {
      this.store.delete(clientKey);
    } else {
      this.store.clear();
    }
  }

  private maybeCleanup(now: number, windowMs: number): void {
    if (now - this.lastCleanup < windowMs * 2) return;
    this.lastCleanup = now;

    const threshold = now - windowMs;
    for (const [key, bucket] of this.store.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > threshold);
      if (bucket.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

/** Global singleton rate limiter for API endpoints */
export const apiRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 60, // 60 requests per minute
  windowMs: 60_000,
});

/**
 * Extracts a client IP or fallback key from an incoming Next.js Request.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}
