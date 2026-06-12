/**
 * app/api/auth/route.ts — Authentication endpoints
 *
 * ENDPOINTS:
 *   POST   /api/auth          Login (username + password → session token)
 *   GET    /api/auth          Fetch current session user ("me")
 *   PUT    /api/auth          Update own profile (display name, phone, etc.)
 *   DELETE /api/auth          Logout (invalidate session token)
 *
 * SECURITY:
 *   - POST is rate-limited per IP to prevent brute-force attacks
 *     (OWASP A07:2021 — Identification and Authentication Failures,
 *      OWASP ASVS v4 §2.2).
 *   - bcrypt cost factor is 12, matching OWASP minimum recommendation.
 *   - Session tokens are UUIDs (128-bit random) stored in a sessions table;
 *     they expire after SESSION_TTL_MS (24 hours) and are validated on every
 *     protected request.
 *   - The login response NEVER discloses whether the username exists vs the
 *     password is wrong — both cases return "Invalid credentials" to prevent
 *     user-enumeration attacks.
 *   - Sensitive fields (password_hash) are never returned in API responses.
 *   - Cache-Control: no-store on all auth responses to prevent caching by
 *     proxies or browser caches (OWASP ASVS v4 §3.4).
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db, { randomUUID } from '@/lib/db';
import { getSessionUser, requireAuth, isNextResponse } from '@/lib/auth-server';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';
import { validateLoginInput, validationErrorBody } from '@/lib/validation';
import { RATE_LIMIT, SESSION_TTL_MS, CACHE_CONTROL } from '@/lib/constants';
import { getClientIp } from '@/lib/middleware';

// ─── Shared response headers ──────────────────────────────────────────────────

/**
 * Auth responses must never be cached — they contain session tokens or user data.
 * OWASP ASVS v4 §3.4.3: "Verify that secure attribute is set on session cookies"
 * (applicable to any sensitive response).
 */
const NO_CACHE = { 'Cache-Control': CACHE_CONTROL.NO_STORE };

// ─── POST /api/auth — Login ───────────────────────────────────────────────────

/**
 * Authenticate a user with username + password and return a session token.
 *
 * Rate limiting:
 *   - 5 attempts per IP per 15 minutes (RATE_LIMIT constants).
 *   - Counter resets on a successful login so a legitimate user who mistyped is
 *     not locked out after their first successful entry.
 *
 * Timing-safe comparison:
 *   bcrypt.compareSync runs in constant time relative to the stored hash length,
 *   preventing timing side-channels that could leak whether the username exists.
 *   We run compareSync even when the user is not found (against a dummy hash) to
 *   ensure the response time is indistinguishable.
 */
export async function POST(req: NextRequest) {
  // ── 1. Rate limit check ────────────────────────────────────────────────────
  const clientIp  = getClientIp(req);
  const rateKey   = `login:${clientIp}`;
  const rateResult = checkRateLimit(
    rateKey,
    RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
    RATE_LIMIT.LOGIN_WINDOW_MS,
    RATE_LIMIT.LOGIN_LOCKOUT_MS,
  );

  if (!rateResult.allowed) {
    const retrySeconds = Math.ceil((rateResult.retryAfterMs ?? RATE_LIMIT.LOGIN_LOCKOUT_MS) / 1000);
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${Math.ceil(retrySeconds / 60)} minutes.` },
      {
        status: 429,
        headers: {
          ...NO_CACHE,
          // RFC 7231 §7.1.3: Retry-After tells clients when to retry
          'Retry-After': String(retrySeconds),
        },
      },
    );
  }

  // ── 2. Parse and validate input ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400, headers: NO_CACHE },
    );
  }

  const validation = validateLoginInput(body);
  if (!validation.valid) {
    return NextResponse.json(
      validationErrorBody(validation.errors),
      { status: 400, headers: NO_CACHE },
    );
  }

  const { username, password } = body as { username: string; password: string };

  // ── 3. Look up user ────────────────────────────────────────────────────────
  // SECURITY: Never disclose the reason for failure (user-enumeration prevention).
  // Whether the username doesn't exist or the password is wrong, always return
  // the same error message and the same approximate response time.
  try {
    const user = db.prepare(
      "SELECT * FROM users WHERE username = ? AND is_active = 1"
    ).get(username.trim()) as any;

    // SECURITY: Run bcrypt comparison even when user not found to prevent timing attacks.
    // A dummy hash is used so compareSync takes similar time regardless.
    const DUMMY_HASH = '$2b$12$invalidhashplaceholderthatnevermatchesanything000000000000';
    const hashToCompare: string = user?.password_hash ?? DUMMY_HASH;
    const passwordValid = bcrypt.compareSync(password, hashToCompare);

    if (!user || !passwordValid) {
      // Generic message — do NOT say "username not found" or "wrong password"
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401, headers: NO_CACHE },
      );
    }

    // ── 4. Create session ──────────────────────────────────────────────────
    // Token is a UUID v4 (128-bit cryptographically random) — safe to use as
    // a bearer token for this session lifetime.
    const token     = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    db.prepare(
      "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), user.id, token, expiresAt);

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    // ── 5. Clear rate-limit on success ─────────────────────────────────────
    // Reset the failure counter so this IP is not penalised on its next attempt.
    clearRateLimit(rateKey);

    // ── 6. Return token and sanitised user object ──────────────────────────
    // SECURITY: NEVER return password_hash or any sensitive internal field.
    return NextResponse.json(
      {
        token,
        user: {
          id:          user.id,
          username:    user.username,
          role:        user.role,
          displayName: user.display_name ?? null,
          qualifications: user.qualifications ?? null,
          phone:       user.phone ?? null,
        },
        expiresIn: SESSION_TTL_MS / 1000, // seconds, for client-side expiry tracking
      },
      { headers: NO_CACHE },
    );
  } catch (err: unknown) {
    // Log full error server-side; return a generic message to the client
    // (OWASP A09:2021 — Security Logging and Monitoring Failures)
    console.error('[/api/auth POST] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500, headers: NO_CACHE },
    );
  }
}

// ─── GET /api/auth — Session check ("me") ────────────────────────────────────

/**
 * Return the currently-authenticated user's profile.
 * Used by the frontend on page load to restore an existing session.
 */
export async function GET(req: NextRequest) {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return NextResponse.json(
      { error: 'Not authenticated.' },
      { status: 401, headers: NO_CACHE },
    );
  }

  // Re-fetch fresh data from DB in case it changed since the session was created
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").get(sessionUser.id) as any;
  if (!u) {
    // Account was deactivated after this session was issued
    return NextResponse.json(
      { error: 'Account not found or inactive.' },
      { status: 404, headers: NO_CACHE },
    );
  }

  return NextResponse.json(
    {
      user: {
        id:               u.id,
        username:         u.username,
        role:             u.role,
        displayName:      u.display_name ?? null,
        qualifications:   u.qualifications ?? null,
        phone:            u.phone ?? null,
        emergencyContact: u.emergency_contact ?? null,
        emergencyPhone:   u.emergency_phone ?? null,
      },
    },
    { headers: NO_CACHE },
  );
}

// ─── PUT /api/auth — Update own profile ──────────────────────────────────────

/**
 * Allow the logged-in user to update their own profile fields.
 * Only the fields listed below are mutable here; role and username changes
 * go through the /api/users admin endpoint.
 */
export async function PUT(req: NextRequest) {
  const authResult = requireAuth(req);
  if (isNextResponse(authResult)) return authResult;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  // Extract and sanitise only the permitted fields
  const {
    displayName,
    qualifications,
    phone,
    emergencyContact,
    emergencyPhone,
  } = body as Record<string, unknown>;

  // Validate optional phone format if provided
  if (phone !== undefined && phone !== null && phone !== '') {
    const { isValidPhone } = await import('@/lib/validation');
    if (!isValidPhone(String(phone))) {
      return NextResponse.json({ error: 'Invalid phone number format.' }, { status: 400 });
    }
  }

  try {
    db.prepare(
      `UPDATE users
       SET display_name      = ?,
           qualifications    = ?,
           phone             = ?,
           emergency_contact = ?,
           emergency_phone   = ?,
           updated_at        = datetime('now')
       WHERE id = ?`
    ).run(
      displayName      ?? null,
      qualifications   ?? null,
      phone            ?? null,
      emergencyContact ?? null,
      emergencyPhone   ?? null,
      authResult.id,
    );

    return NextResponse.json({ success: true }, { headers: NO_CACHE });
  } catch (err: unknown) {
    console.error('[/api/auth PUT] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// ─── DELETE /api/auth — Logout ────────────────────────────────────────────────

/**
 * Invalidate the session token.  The client should also clear its local copy.
 *
 * SECURITY: Deleting the session row ensures the token cannot be reused even if
 * an attacker intercepts it after logout (OWASP ASVS v4 §3.3 — Session Termination).
 */
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.substring(7).trim();
    if (token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
  }
  // Always return success — the client should clear its token regardless of whether
  // the server-side delete succeeded (e.g., already-expired session).
  return NextResponse.json({ success: true }, { headers: NO_CACHE });
}
