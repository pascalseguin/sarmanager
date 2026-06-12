/**
 * lib/auth-server.ts — Server-side session validation
 *
 * PURPOSE: A single source of truth for "is this request authenticated, and who
 * is the caller?"  Every API route that requires authentication calls functions
 * from this module.
 *
 * DESIGN: We use Bearer tokens in the Authorization header rather than cookies
 * because the app is a desktop application with no browser cookie domain.  The
 * token is stored client-side in localStorage (acceptable for a local desktop app;
 * see auth-context.tsx for the client-side commentary on this trade-off).
 *
 * TOKEN LIFECYCLE:
 *   1. Client POSTs to /api/auth with username + password.
 *   2. Server creates a row in the sessions table with a UUID token and an expiry.
 *   3. Client stores the token in localStorage.
 *   4. On every subsequent request, client sends `Authorization: Bearer <token>`.
 *   5. getSessionUser() validates the token against the sessions table and returns
 *      the user object if valid, null otherwise.
 *   6. On logout, DELETE /api/auth removes the sessions row.
 *
 * SECURITY REFERENCES:
 *   OWASP A07:2021 — Identification and Authentication Failures
 *   OWASP ASVS v4 §3 (Session Management Verification Requirements)
 */

import { NextRequest, NextResponse } from 'next/server';
import db from './db';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The minimal session payload returned by getSessionUser().
 * Keep this lean — only include fields needed by route handlers so we don't
 * accidentally leak sensitive data from the users table.
 */
export interface SessionUser {
  id:       string;
  username: string;
  role:     string;
}

// ─── Core session validation ──────────────────────────────────────────────────

/**
 * Validate the Bearer token from the Authorization header and return the
 * associated user record, or null if the token is missing/invalid/expired.
 *
 * SECURITY:
 *   - Token is looked up in the sessions table via a parameterised query
 *     (prevents SQL injection — OWASP A03:2021).
 *   - The query checks `expires_at > datetime('now')` so expired sessions are
 *     automatically rejected without a separate cleanup job.
 *   - `u.is_active = 1` ensures deactivated accounts cannot use existing tokens.
 *   - We do NOT distinguish "token not found" from "token expired" — both return
 *     null.  The client always gets a 401 regardless of the reason.
 *
 * PERFORMANCE: This runs on every protected request.  SQLite performs a primary-
 * key index scan on sessions.token (the column has a UNIQUE constraint), so this
 * is an O(log n) operation — fast enough for the expected session table size.
 */
export function getSessionUser(req: NextRequest): SessionUser | null {
  const authHeader = req.headers.get('authorization');

  // Header must be present and start with "Bearer " (case-sensitive per RFC 6750)
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  // Join to users table so we get role and can check is_active in one query
  const session = db.prepare(`
    SELECT s.user_id, u.username, u.role
    FROM   sessions s
    JOIN   users    u ON s.user_id = u.id
    WHERE  s.token      = ?
      AND  s.expires_at > datetime('now')
      AND  u.is_active  = 1
  `).get(token) as { user_id: string; username: string; role: string } | undefined;

  if (!session) return null;

  return {
    id:       session.user_id,
    username: session.username,
    role:     session.role,
  };
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if the given role has Search Manager privileges.
 *
 * Both 'sm' and 'admin' are considered SMs.  The 'admin' role additionally
 * has access to user-management endpoints.
 *
 * IMPORTANT: Update this function and ROLES constant together.
 */
export function isSM(role: string): boolean {
  return role === 'sm' || role === 'admin';
}

// ─── Guard functions ──────────────────────────────────────────────────────────
//
// These are used in route handlers that have NOT yet been migrated to the
// withSM() / withAuth() HOF wrappers in lib/middleware.ts.
//
// Pattern:
//   const result = requireSM(req);
//   if (isNextResponse(result)) return result;   // exits with 401/403
//   // result is now SessionUser — safe to use

/**
 * Require any authenticated user.
 * Returns the SessionUser on success or a 401 NextResponse on failure.
 */
export function requireAuth(req: NextRequest): SessionUser | NextResponse {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }
  return user;
}

/**
 * Require an authenticated Search Manager (SM or admin) user.
 * Returns the SessionUser on success, or a 401/403 NextResponse on failure.
 */
export function requireSM(req: NextRequest): SessionUser | NextResponse {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }
  if (!isSM(user.role)) {
    // 403 Forbidden: authenticated but not authorised (OWASP A01:2021 — Broken Access Control)
    return NextResponse.json(
      { error: 'Search Manager access required.' },
      { status: 403 },
    );
  }
  return user;
}

/**
 * Type guard: distinguish a NextResponse from a SessionUser.
 * Used in the old inline pattern:
 *   const result = requireSM(req);
 *   if (isNextResponse(result)) return result;
 *
 * NOTE: Prefer the withSM() / withAuth() HOFs from lib/middleware.ts for new routes.
 * They achieve the same result with less boilerplate and automatic error handling.
 */
export function isNextResponse(v: SessionUser | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
