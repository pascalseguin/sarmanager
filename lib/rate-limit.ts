/**
 * lib/rate-limit.ts — In-memory sliding-window rate limiter
 *
 * PURPOSE: Prevent brute-force and credential-stuffing attacks on authentication
 * endpoints by limiting the number of attempts from a given source within a time
 * window.
 *
 * SECURITY REFERENCES:
 *   OWASP A07:2021 — Identification and Authentication Failures
 *   OWASP ASVS v4 §2.2 (General Authenticator Requirements):
 *     "Verify that anti-automation controls are effective at mitigating breached
 *      credential testing, brute force, and account lockout attacks."
 *
 * IMPLEMENTATION NOTES:
 *   - Single-process in-memory store — suitable for a SQLite desktop application
 *     where only one Next.js process runs at a time.
 *   - In a multi-process / multi-instance deployment, replace the Map with a Redis
 *     store (e.g., ioredis + rate-limiter-flexible) so limits are shared.
 *   - The store is a module-level singleton; it persists across requests but resets
 *     when the server process restarts.  For a desktop app this is acceptable.
 *
 * USAGE:
 *   import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';
 *
 *   // In a route handler:
 *   const ip = req.headers.get('x-real-ip') ?? 'unknown';
 *   const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60_000);
 *   if (!rl.allowed) {
 *     return NextResponse.json({ error: 'Too many attempts' }, {
 *       status: 429,
 *       headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs! / 1000)) },
 *     });
 *   }
 */

// ─── Internal record type ─────────────────────────────────────────────────────

interface RateLimitRecord {
  /** Timestamps (ms) of each attempt recorded within the current window. */
  attempts: number[];
  /**
   * Epoch ms until which the key is unconditionally blocked.
   * Set when attempts exceeds the limit; undefined means not locked.
   */
  blockedUntil?: number;
}

// ─── Module-level store ───────────────────────────────────────────────────────

/**
 * Central store for all rate-limit buckets.
 * Keys are arbitrary strings — typically `"<action>:<identifier>"` to allow
 * per-action limits for the same IP (e.g., "login:127.0.0.1" vs
 * "d4h-sync:127.0.0.1").
 */
const store = new Map<string, RateLimitRecord>();

/**
 * Periodic cleanup: prune records that have been inactive for > 1 hour to
 * prevent unbounded memory growth.  The interval is non-blocking.
 */
setInterval(() => {
  const staleThreshold = Date.now() - 3_600_000; // 1 hour ago
  for (const [key, rec] of store.entries()) {
    const lastAttempt = rec.attempts[rec.attempts.length - 1] ?? 0;
    const blockExpires = rec.blockedUntil ?? 0;
    if (lastAttempt < staleThreshold && blockExpires < staleThreshold) {
      store.delete(key);
    }
  }
}, 300_000); // Run every 5 minutes

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether this request is allowed to proceed. */
  allowed: boolean;
  /** How many attempts remain before the key is blocked. */
  remaining: number;
  /** Milliseconds until the sliding window resets for this key. */
  resetMs: number;
  /**
   * Only set when `allowed === false`.
   * Milliseconds the caller must wait before retrying.
   * Use this to populate the `Retry-After` HTTP header.
   */
  retryAfterMs?: number;
}

/**
 * Check whether a key is within its rate limit and record the attempt.
 *
 * @param key          Bucket identifier, e.g. `"login:192.168.1.1"`.
 * @param maxAttempts  Maximum allowed attempts within the window before blocking.
 * @param windowMs     Sliding window duration in milliseconds.
 * @param lockoutMs    Duration to block after limit is exceeded. Defaults to windowMs.
 *
 * @returns RateLimitResult — check `.allowed` before proceeding.
 *
 * IMPORTANT: This function mutates the store whether or not the request is allowed.
 * Always call it exactly once per incoming request (do not call it again on retry).
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  lockoutMs = windowMs,
): RateLimitResult {
  const now = Date.now();
  const rec: RateLimitRecord = store.get(key) ?? { attempts: [] };

  // ── Check existing lockout ────────────────────────────────────────────────
  // If the key is currently locked out, deny without recording a new attempt.
  // This prevents "attempt counter extension" where each new attempt pushes
  // the block expiry further out.
  if (rec.blockedUntil !== undefined && now < rec.blockedUntil) {
    return {
      allowed:      false,
      remaining:    0,
      resetMs:      rec.blockedUntil - now,
      retryAfterMs: rec.blockedUntil - now,
    };
  }

  // ── Prune attempts outside the sliding window ─────────────────────────────
  const windowStart = now - windowMs;
  rec.attempts = rec.attempts.filter(t => t > windowStart);

  // ── Check limit ───────────────────────────────────────────────────────────
  if (rec.attempts.length >= maxAttempts) {
    // Too many attempts — apply lockout and deny
    rec.blockedUntil = now + lockoutMs;
    store.set(key, rec);
    return {
      allowed:      false,
      remaining:    0,
      resetMs:      lockoutMs,
      retryAfterMs: lockoutMs,
    };
  }

  // ── Record this attempt and allow ─────────────────────────────────────────
  rec.attempts.push(now);
  store.set(key, rec);

  return {
    allowed:   true,
    remaining: maxAttempts - rec.attempts.length,
    resetMs:   windowMs,
  };
}

/**
 * Clear all rate-limit state for a key.
 *
 * Call this after a successful authentication to reset the failure counter,
 * so a user who had multiple failures followed by a correct password is not
 * penalised on their next login attempt.
 *
 * @param key The same key string passed to checkRateLimit.
 */
export function clearRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Check current state without recording an attempt (read-only).
 * Useful for exposing remaining attempts in API responses without consuming a slot.
 */
export function peekRateLimit(key: string, maxAttempts: number, windowMs: number): {
  blocked: boolean;
  remaining: number;
  retryAfterMs?: number;
} {
  const now  = Date.now();
  const rec  = store.get(key);
  if (!rec) return { blocked: false, remaining: maxAttempts };

  if (rec.blockedUntil !== undefined && now < rec.blockedUntil) {
    return { blocked: true, remaining: 0, retryAfterMs: rec.blockedUntil - now };
  }

  const windowStart = now - windowMs;
  const active = rec.attempts.filter(t => t > windowStart).length;
  return { blocked: false, remaining: maxAttempts - active };
}
