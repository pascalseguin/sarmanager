/**
 * lib/middleware.ts — Route-level authentication / authorisation wrappers
 *
 * PURPOSE: Eliminate the copy-pasted boilerplate:
 *
 *   const result = requireSM(req);
 *   if (isNextResponse(result)) return result;
 *
 * …that appears at the top of every protected route handler.  Having this pattern
 * duplicated in ~40 files creates two problems:
 *   1. A developer writing a new route can forget to include it (access-control gap).
 *   2. There is no single place to add cross-cutting concerns (audit logging, etc.).
 *
 * With these HOFs, protected routes look like:
 *
 *   export const GET = withSM(async (req, user) => {
 *     // user is already validated as an SM/admin here
 *     return NextResponse.json({ data: ... });
 *   });
 *
 * SECURITY REFERENCES:
 *   OWASP A01:2021 — Broken Access Control:
 *     Enforce access control server-side on every request, not just on "obvious"
 *     admin routes.
 *   OWASP ASVS v4 §1.4 (Access Control Architectural Requirements):
 *     "Verify that all access control decisions can be logged and that failed
 *      decisions are logged."  The wrappers below are the correct place to add
 *      that logging when the audit log table is ready.
 *
 * USAGE:
 *   // Flat route (no URL params):
 *   export const GET  = withSM(async (req, user) => { ... });
 *   export const POST = withSM(async (req, user) => { ... });
 *
 *   // Dynamic route with params (e.g., /api/operations/[id]):
 *   export const GET = withSMParam(async (req, { params }, user) => {
 *     const { id } = await params;
 *     ...
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSM, requireAuth, isNextResponse, SessionUser } from './auth-server';

// ─── Handler type aliases ─────────────────────────────────────────────────────

/**
 * A route handler that receives a validated SessionUser.
 * Used with withSM() / withAuth() for flat routes.
 */
export type AuthedHandler = (req: NextRequest, user: SessionUser) => Promise<NextResponse>;

/**
 * A route handler with dynamic route params AND a validated SessionUser.
 * Used with withSMParam() / withAuthParam() for dynamic segments.
 *
 * The generic P allows callers to type their specific param names:
 *   withSMParam<{ id: string }>(async (req, { params }, user) => { ... })
 */
export type AuthedParamHandler<P extends Record<string, string> = Record<string, string>> = (
  req:  NextRequest,
  ctx:  { params: Promise<P> },
  user: SessionUser,
) => Promise<NextResponse>;

// ─── Flat route wrappers ──────────────────────────────────────────────────────

/**
 * Wrap a route handler to require Search Manager (SM or admin) access.
 * Returns 401 if not authenticated, 403 if authenticated but not SM.
 * Wraps the handler in a try/catch so unhandled errors return 500 rather
 * than crashing the process.
 */
export function withSM(handler: AuthedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Authenticate and authorise before any body parsing or DB work
    const user = requireSM(req);
    if (isNextResponse(user)) return user; // 401 or 403

    try {
      return await handler(req, user);
    } catch (err: unknown) {
      // Log server-side but return a generic message to avoid leaking internals
      // (OWASP A09:2021 — Security Logging and Monitoring Failures)
      console.error('[withSM] Unhandled error:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

/**
 * Wrap a route handler to require any authenticated user (no role restriction).
 * Useful for "my profile" or personal data endpoints.
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const user = requireAuth(req);
    if (isNextResponse(user)) return user; // 401

    try {
      return await handler(req, user);
    } catch (err: unknown) {
      console.error('[withAuth] Unhandled error:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

// ─── Dynamic-route wrappers ───────────────────────────────────────────────────

/**
 * Wrap a dynamic-segment route handler (e.g., /api/operations/[id]) to require
 * Search Manager access.
 *
 * @example
 * export const PATCH = withSMParam<{ id: string }>(async (req, { params }, user) => {
 *   const { id } = await params;
 *   ...
 * });
 */
export function withSMParam<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedParamHandler<P>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<NextResponse> => {
    const user = requireSM(req);
    if (isNextResponse(user)) return user;

    try {
      return await handler(req, ctx, user);
    } catch (err: unknown) {
      console.error('[withSMParam] Unhandled error:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

/**
 * Wrap a dynamic-segment route handler to require any authenticated user.
 */
export function withAuthParam<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedParamHandler<P>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<NextResponse> => {
    const user = requireAuth(req);
    if (isNextResponse(user)) return user;

    try {
      return await handler(req, ctx, user);
    } catch (err: unknown) {
      console.error('[withAuthParam] Unhandled error:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Extract the best-available client IP address from request headers.
 *
 * Used to bucket rate-limit attempts by source.  The cascade:
 *   1. X-Real-IP    — set by Nginx / reverse proxies for the true client IP
 *   2. X-Forwarded-For — leftmost entry is the originating client (may be spoofed
 *                        if not behind a trusted proxy)
 *   3. 'unknown'    — fallback for localhost / desktop app calls where no headers exist
 *
 * SECURITY: If this app is deployed behind a trusted proxy, configure that proxy to
 * overwrite X-Real-IP so clients cannot spoof it.  For a local desktop app this does
 * not matter as all traffic originates from 127.0.0.1.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}
