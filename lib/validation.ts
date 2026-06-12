/**
 * lib/validation.ts — Server-side input validation utilities
 *
 * PURPOSE: Centralise all validation logic so that:
 *   1. No route handler needs to re-implement the same checks.
 *   2. Changes to business rules propagate everywhere automatically.
 *   3. Validation is testable in isolation.
 *
 * DESIGN: We intentionally do NOT use a third-party schema library (e.g., Zod)
 * because the project has no such dependency and adding one requires an install step.
 * These helpers cover the same ground with plain TypeScript.
 *
 * SECURITY REFERENCES:
 *   OWASP A03:2021 — Injection:       All user data must be validated and sanitised
 *                                      before use in SQL, templates, or external APIs.
 *   OWASP A05:2021 — Security Misconfiguration: Reject unexpected field values
 *                                      so only valid data enters the system.
 *   OWASP ASVS v4 §5 (Input Validation): Server-side validation is mandatory even
 *                                      when the client also validates.
 */

import { MAX_LENGTHS, PASSWORD_MIN_LENGTH, ROLES } from './constants';

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ValidationError {
  /** The field name that failed validation (matches the request body key). */
  field:   string;
  /** Human-readable explanation of the failure. */
  message: string;
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

// ─── Primitive validators ─────────────────────────────────────────────────────

/** Returns true if value is a non-empty string after trimming whitespace. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Returns true if value is a string not exceeding maxLen characters. */
export function isStringWithinLength(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.length <= maxLen;
}

/**
 * Basic email format check.
 * NOTE: Full RFC-5321 validation is complex; we verify structural plausibility only.
 * Actual deliverability is confirmed when the email is used.
 */
export function isValidEmail(email: string): boolean {
  return (
    typeof email === 'string' &&
    email.length > 0 &&
    email.length <= MAX_LENGTHS.EMAIL &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/**
 * Phone validation — accepts common North American formats.
 * Valid examples: 403-555-0100, (403) 555-0100, 4035550100, +14035550100
 *
 * SECURITY: Phone numbers are used to look up personnel during check-in;
 * a forged phone matching another person's record would be an IDOR attack.
 * Strict format validation reduces the attack surface.
 */
export function isValidPhone(phone: string): boolean {
  const normalised = phone.replace(/[\s()\-\.]/g, '');
  return /^[+]?1?[0-9]{10,11}$/.test(normalised);
}

/**
 * Password complexity check.
 * Requirements (OWASP ASVS §2.1.1–2.1.7):
 *   - Minimum PASSWORD_MIN_LENGTH characters
 *   - Maximum MAX_LENGTHS.PASSWORD characters (prevents bcrypt DoS — bcrypt silently
 *     truncates at 72 bytes; we hard-cap at 128 chars on our end)
 *   - At least one letter and one digit (baseline complexity)
 *
 * OWASP recommends checking against known-breached passwords (Have I Been Pwned API).
 * That is out of scope for this offline desktop application.
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > MAX_LENGTHS.PASSWORD) {
    return { valid: false, reason: `Password must not exceed ${MAX_LENGTHS.PASSWORD} characters.` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

/** Validates that role is one of the allowed system roles. */
export function isValidRole(role: unknown): role is 'sm' | 'admin' {
  return typeof role === 'string' && (Object.values(ROLES) as string[]).includes(role);
}

// ─── Domain object validators ─────────────────────────────────────────────────

/**
 * Validate a login request body.
 * Called in app/api/auth/route.ts BEFORE the bcrypt comparison so that
 * malformed requests are rejected cheaply (no DB hit, no bcrypt work).
 */
export function validateLoginInput(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof body !== 'object' || body === null) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.username)) {
    errors.push({ field: 'username', message: 'Username is required.' });
  } else if (!isStringWithinLength(b.username, MAX_LENGTHS.USERNAME)) {
    errors.push({ field: 'username', message: `Username must not exceed ${MAX_LENGTHS.USERNAME} characters.` });
  }

  if (!isNonEmptyString(b.password)) {
    errors.push({ field: 'password', message: 'Password is required.' });
  }
  // NOTE: We do NOT validate password complexity on login — only on registration.
  // Checking complexity here would confuse users who created their account before
  // the policy was strengthened.

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a new-user creation request.
 * Called in app/api/users/route.ts POST handler.
 */
export function validateCreateUser(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof body !== 'object' || body === null) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const b = body as Record<string, unknown>;

  // ── Username ──────────────────────────────────────────────────────────────
  if (!isNonEmptyString(b.username)) {
    errors.push({ field: 'username', message: 'Username is required.' });
  } else if (!isStringWithinLength(b.username, MAX_LENGTHS.USERNAME)) {
    errors.push({ field: 'username', message: `Username must not exceed ${MAX_LENGTHS.USERNAME} characters.` });
  } else if (!/^[a-zA-Z0-9._\-]+$/.test(b.username as string)) {
    // Only alphanumeric + safe punctuation — prevents username confusion attacks
    errors.push({ field: 'username', message: 'Username may only contain letters, numbers, dots, hyphens, and underscores.' });
  }

  // ── Password ──────────────────────────────────────────────────────────────
  if (!isNonEmptyString(b.password)) {
    errors.push({ field: 'password', message: 'Password is required.' });
  } else {
    const pwCheck = validatePasswordStrength(b.password as string);
    if (!pwCheck.valid) errors.push({ field: 'password', message: pwCheck.reason! });
  }

  // ── Role ──────────────────────────────────────────────────────────────────
  if (!isValidRole(b.role)) {
    errors.push({ field: 'role', message: 'Role must be "sm" or "admin".' });
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (b.email && !isValidEmail(b.email as string)) {
    errors.push({ field: 'email', message: 'Invalid email address format.' });
  }

  if (b.phone && !isValidPhone(b.phone as string)) {
    errors.push({ field: 'phone', message: 'Invalid phone number format (e.g., 403-555-0100).' });
  }

  if (b.displayName && !isStringWithinLength(b.displayName, MAX_LENGTHS.DISPLAY_NAME)) {
    errors.push({ field: 'displayName', message: `Display name must not exceed ${MAX_LENGTHS.DISPLAY_NAME} characters.` });
  }

  if (b.qualifications && !isStringWithinLength(b.qualifications, MAX_LENGTHS.QUALIFICATIONS)) {
    errors.push({ field: 'qualifications', message: `Qualifications must not exceed ${MAX_LENGTHS.QUALIFICATIONS} characters.` });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an operation creation/update request.
 * Called in app/api/operations/route.ts POST and PATCH handlers.
 *
 * NOTE: Only validates fields that are present in the body — a PATCH request
 * does not need to supply all fields.
 */
export function validateOperation(body: unknown, requireName = true): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof body !== 'object' || body === null) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const b = body as Record<string, unknown>;

  // ── Name (required on create, optional on update) ─────────────────────────
  if (requireName) {
    if (!isNonEmptyString(b.name)) {
      errors.push({ field: 'name', message: 'Operation name is required.' });
    } else if (!isStringWithinLength(b.name, MAX_LENGTHS.OP_NAME)) {
      errors.push({ field: 'name', message: `Name must not exceed ${MAX_LENGTHS.OP_NAME} characters.` });
    }
  } else if (b.name !== undefined && !isStringWithinLength(b.name, MAX_LENGTHS.OP_NAME)) {
    errors.push({ field: 'name', message: `Name must not exceed ${MAX_LENGTHS.OP_NAME} characters.` });
  }

  // ── Age ───────────────────────────────────────────────────────────────────
  if (b.lost_person_age !== undefined && b.lost_person_age !== null && b.lost_person_age !== '') {
    const age = Number(b.lost_person_age);
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      errors.push({ field: 'lost_person_age', message: 'Age must be an integer between 0 and 120.' });
    }
  }

  // ── Priority ──────────────────────────────────────────────────────────────
  if (b.priority !== undefined) {
    if (![1, 2, 3].includes(Number(b.priority))) {
      errors.push({ field: 'priority', message: 'Priority must be 1 (high), 2 (medium), or 3 (low).' });
    }
  }

  // ── Coordinates ───────────────────────────────────────────────────────────
  if (b.latitude !== undefined && b.latitude !== null && b.latitude !== '') {
    const lat = Number(b.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push({ field: 'latitude', message: 'Latitude must be between -90 and 90.' });
    }
  }
  if (b.longitude !== undefined && b.longitude !== null && b.longitude !== '') {
    const lon = Number(b.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.push({ field: 'longitude', message: 'Longitude must be between -180 and 180.' });
    }
  }

  // ── String length caps on free-text fields ────────────────────────────────
  const textFields: [string, number][] = [
    ['description',          MAX_LENGTHS.DESCRIPTION],
    ['lost_person_name',     MAX_LENGTHS.NAME],
    ['subject_clothing',     MAX_LENGTHS.DESCRIPTION],
    ['subject_gear',         MAX_LENGTHS.DESCRIPTION],
    ['subject_circumstance', MAX_LENGTHS.DESCRIPTION],
    ['subject_condition',    MAX_LENGTHS.DESCRIPTION],
    ['last_seen_location',   MAX_LENGTHS.DESCRIPTION],
    ['pls_location',         MAX_LENGTHS.DESCRIPTION],
    ['lkp_notes',            MAX_LENGTHS.NOTES],
    ['safety_concerns',      MAX_LENGTHS.NOTES],
    ['oic_name',             MAX_LENGTHS.NAME],
    ['oic_phone',            MAX_LENGTHS.PHONE],
    ['tasking_agency',       MAX_LENGTHS.NAME],
    ['mutual_aid_orgs',      MAX_LENGTHS.DESCRIPTION],
  ];
  for (const [field, maxLen] of textFields) {
    if (b[field] !== undefined && !isStringWithinLength(b[field], maxLen)) {
      errors.push({ field, message: `${field} must not exceed ${maxLen} characters.` });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Response helper ──────────────────────────────────────────────────────────

/**
 * Format validation errors into a consistent API response shape.
 * Returns both a machine-readable `errors` array and a human-readable `error` string.
 */
export function validationErrorBody(errors: ValidationError[]): { errors: ValidationError[]; error: string } {
  return {
    errors,
    error: errors.map(e => `${e.field}: ${e.message}`).join('  |  '),
  };
}

// ─── Sanitisation ─────────────────────────────────────────────────────────────

/**
 * Trim whitespace and enforce a maximum length.
 *
 * SECURITY NOTE: React already HTML-encodes interpolated values in JSX, providing
 * first-line XSS protection.  We sanitise at the API layer as defence-in-depth:
 * data stored in SQLite may be exported to CSV, PDF, or external APIs that do NOT
 * automatically escape, and future code paths may render it outside React.
 *
 * We do NOT strip HTML tags here because legitimate field values (e.g., SMEAC
 * briefing notes) may contain angle-bracket characters like `< 50m`.  Stripping
 * would silently corrupt data.  Instead we rely on React's escaping at render time
 * and output encoding at export time.
 */
export function sanitizeString(s: string, maxLen: number): string {
  return s.trim().slice(0, maxLen);
}
