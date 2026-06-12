/**
 * lib/constants.ts — Application-wide domain constants
 *
 * PURPOSE: Centralise every magic string and magic number in one place so that:
 *   1. Changes propagate everywhere automatically (no grep-and-replace).
 *   2. TypeScript can enforce valid values via discriminated unions / const assertions.
 *   3. Code is self-documenting — `ROLES.SM` is clearer than the bare string `'sm'`.
 *
 * RULE: Never write a bare string literal for one of these concepts anywhere else in the
 * codebase.  Import from here instead.
 *
 * OWASP reference: Having explicit allowed-value lists prevents injection of unexpected
 * enum values into SQL or business logic (A03:2021 — Injection).
 */

// ─── User roles ───────────────────────────────────────────────────────────────

/**
 * All valid user roles in the system.
 * IMPORTANT: When adding a new role you must also update:
 *   - lib/auth-server.ts  isSM()
 *   - app/api/users/route.ts  POST validation
 *   - Database seeds in lib/db.ts
 */
export const ROLES = {
  SM:    'sm',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

// ─── Operation status ────────────────────────────────────────────────────────

export const OPERATION_STATUS = {
  ACTIVE:  'active',
  STANDBY: 'standby',
  CLOSED:  'closed',
} as const;

export type OperationStatus = (typeof OPERATION_STATUS)[keyof typeof OPERATION_STATUS];

// ─── Operation types ─────────────────────────────────────────────────────────

export const OPERATION_TYPE = {
  SEARCH:   'search',
  RESCUE:   'rescue',
  RECOVERY: 'recovery',
  ASSIST:   'assist',
} as const;

export type OperationType = (typeof OPERATION_TYPE)[keyof typeof OPERATION_TYPE];

// ─── IPP reference point type ────────────────────────────────────────────────

export const IPP_TYPE = {
  PLS: 'pls', // Point Last Seen
  LKP: 'lkp', // Last Known Point
} as const;

export type IppType = (typeof IPP_TYPE)[keyof typeof IPP_TYPE];

// ─── Deployment decision ─────────────────────────────────────────────────────

export const DEPLOY_DECISION = {
  YES: 'yes',
  NO:  'no',
} as const;

// ─── Session and authentication ──────────────────────────────────────────────

/** Session lifetime: 24 hours expressed in both ms and seconds for different APIs */
export const SESSION_TTL_MS      = 86_400_000;
export const SESSION_TTL_SECONDS = 86_400;

/** localStorage key — change this to invalidate all existing browser sessions */
export const SESSION_STORAGE_KEY = 'sarmanager_session_token';

// ─── Rate limiting ────────────────────────────────────────────────────────────
/**
 * Brute-force protection settings.
 * OWASP A07:2021 — Identification and Authentication Failures.
 *
 * LOGIN_MAX_ATTEMPTS: How many failed attempts are allowed in LOGIN_WINDOW_MS
 *   before the key is temporarily blocked.
 *
 * LOGIN_LOCKOUT_MS: How long the account/IP is blocked after exceeding the limit.
 *   Set to 15 min — long enough to deter scripted attacks, short enough not to
 *   lock out a legitimate user who mistyped their password.
 */
export const RATE_LIMIT = {
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS:    15 * 60_000, // 15 minutes
  LOGIN_LOCKOUT_MS:   15 * 60_000, // 15 minutes
} as const;

// ─── Input validation bounds ──────────────────────────────────────────────────
/**
 * Maximum permitted lengths for user-supplied string fields.
 * Enforced both on the client (for UX) and server (for security).
 *
 * Why these limits?
 *   - Prevent DoS via enormous payloads (database write amplification).
 *   - Prevent stored XSS payloads that exceed normal field lengths.
 *   - Column sizes in SQLite TEXT are technically unlimited, but downstream
 *     consumers (SMS, PDF, D4H API) have their own limits we must respect.
 */
export const MAX_LENGTHS = {
  USERNAME:      50,
  PASSWORD:      128,
  EMAIL:         255,
  DISPLAY_NAME:  100,
  PHONE:         20,
  NAME:          255,
  DESCRIPTION:   2_000,
  NOTES:         5_000,
  QUALIFICATIONS: 1_000,
  OP_NAME:       255,
  SMS_BODY:      150,   // Twilio SMS hard limit
} as const;

export const PASSWORD_MIN_LENGTH = 8;

// ─── Vehicle equipment filter ─────────────────────────────────────────────────
/**
 * SQL LIKE fragment used to identify vehicle-type equipment items.
 * Centralised here because it is used in:
 *   - app/api/checkin/vehicles/route.ts
 *   - app/api/equipment/operations/[opId]/available/route.ts
 *
 * NOTE: This is safe to interpolate into SQL because it contains no user data —
 * it is a developer-controlled constant.  User-supplied values must always use
 * parameterised placeholders.
 */
export const VEHICLE_SQL_FILTER =
  `(UPPER(type) LIKE '%VEHICLE%' OR UPPER(type) LIKE '%TRUCK%' OR UPPER(type) LIKE '%VAN%' ` +
  `OR UPPER(type) LIKE '%UTV%' OR UPPER(type) LIKE '%ATV%' OR UPPER(category) LIKE '%VEHICLE%')`;

// ─── HTTP headers ─────────────────────────────────────────────────────────────

/**
 * Standard cache-control values.
 * SECURITY: Sensitive API responses must never be cached by a shared proxy.
 */
export const CACHE_CONTROL = {
  NO_STORE: 'no-store, no-cache, must-revalidate',
  PRIVATE:  'private, max-age=60',          // user-specific, 1-min fresh
  PUBLIC:   'public, max-age=300, s-maxage=60', // non-sensitive, 5-min fresh
} as const;
