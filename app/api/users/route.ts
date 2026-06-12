/**
 * app/api/users/route.ts — User management (SM-only)
 *
 * ENDPOINTS:
 *   GET  /api/users   — List all users (SM/admin only)
 *   POST /api/users   — Create a new user (SM/admin only)
 *
 * SECURITY:
 *   - All endpoints require SM or admin role (requireSM guard).
 *   - POST validates all input via validateCreateUser() before any DB work.
 *   - Password strength is enforced server-side (not just on the client).
 *   - bcrypt cost factor 12 (OWASP recommended minimum) is used for hashing.
 *   - password_hash is never returned in responses.
 *   - Duplicate username/email check returns 409 Conflict (not 200 with a
 *     confusing body), and the message is generic to avoid username enumeration.
 *
 * REFERENCES:
 *   OWASP A07:2021 — Identification and Authentication Failures
 *   OWASP ASVS v4 §2.1 (Password Security Requirements)
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';
import { validateCreateUser, validationErrorBody } from '@/lib/validation';

// ─── Helper: keep personnel table in sync with users table ───────────────────
/**
 * Ensure a personnel row exists for the given user.
 * The personnel table is the field-operations roster; every user should have
 * a corresponding personnel entry so they can be assigned to tasks.
 *
 * Called after creating a new user and after profile updates.
 */
function syncPersonnel(userId: string): void {
  const u = db.prepare(
    "SELECT id, display_name, username, qualifications, phone, role FROM users WHERE id = ?"
  ).get(userId) as any;
  if (!u) return;

  // Use display_name if set, fall back to username
  const name = u.display_name || u.username;

  const existing = db.prepare("SELECT id FROM personnel WHERE user_id = ?").get(userId) as any;
  if (existing) {
    // Update existing personnel row with fresh user data
    db.prepare(
      `UPDATE personnel
       SET name         = ?,
           qualifications = ?,
           contact      = ?,
           updated_at   = datetime('now')
       WHERE user_id = ?`
    ).run(name, u.qualifications ?? null, u.phone ?? null, userId);
  } else {
    // Create new personnel row
    db.prepare(
      `INSERT INTO personnel (id, name, qualifications, contact, user_id, role, status)
       VALUES (?, ?, ?, ?, ?, ?, 'available')`
    ).run(
      randomUUID(),
      name,
      u.qualifications ?? null,
      u.phone          ?? null,
      userId,
      // Map user role to personnel role label
      u.role === 'sm' ? 'Search Manager' : 'IMT Member',
    );
  }
}

// ─── GET /api/users ───────────────────────────────────────────────────────────

/**
 * Return all active and inactive users.
 * SECURITY: Only accessible to SM/admin — regular searchers cannot list users.
 * password_hash is excluded from the SELECT to prevent accidental exposure.
 */
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  const users = db.prepare(`
    SELECT
      u.id, u.username, u.email, u.display_name, u.role,
      u.is_active, u.last_login, u.created_at,
      u.qualifications, u.phone,
      u.emergency_contact, u.emergency_phone,
      p.id AS personnel_id
    FROM users u
    LEFT JOIN personnel p ON p.user_id = u.id
    ORDER BY u.created_at ASC
  `).all();

  return NextResponse.json({ users });
}

// ─── POST /api/users ──────────────────────────────────────────────────────────

/**
 * Create a new user account.
 *
 * Required body fields:
 *   username (string, 1–50 chars, alphanumeric + dots/hyphens/underscores)
 *   password (string, 8–128 chars, at least one letter and one number)
 *   role     ('sm' | 'admin')
 *
 * Optional body fields:
 *   email, displayName, qualifications, phone
 */
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  // ── Validate all fields before touching the database ─────────────────────
  const validation = validateCreateUser(body);
  if (!validation.valid) {
    return NextResponse.json(validationErrorBody(validation.errors), { status: 400 });
  }

  const {
    username,
    password,
    role,
    displayName,
    email,
    qualifications,
    phone,
  } = body as Record<string, unknown>;

  // ── Resolve email ─────────────────────────────────────────────────────────
  // Use a local placeholder if the caller did not supply an email.
  // This keeps the UNIQUE constraint on email valid without requiring the field.
  const resolvedEmail = (email as string | undefined) || `${username}@sar-manager.local`;

  // ── Duplicate check ───────────────────────────────────────────────────────
  // SECURITY: Return a generic message — don't confirm which field is taken
  // (username enumeration risk).  409 Conflict is the correct status here.
  const duplicate = db.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ?"
  ).get(username as string, resolvedEmail);

  if (duplicate) {
    return NextResponse.json(
      { error: 'Username or email already in use.' },
      { status: 409 },
    );
  }

  // ── Create user ───────────────────────────────────────────────────────────
  try {
    const id = randomUUID();

    // bcrypt cost 12: roughly 400ms on modern hardware — expensive enough to
    // deter offline dictionary attacks while not noticeable to the user
    // (OWASP ASVS v4 §2.4.1).
    const passwordHash = bcrypt.hashSync(password as string, 12);

    db.prepare(
      `INSERT INTO users
         (id, username, email, password_hash, role, display_name, qualifications, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      username     as string,
      resolvedEmail,
      passwordHash,
      role         as string,
      displayName  ?? null,
      qualifications ?? null,
      phone        ?? null,
    );

    // Keep personnel roster in sync
    syncPersonnel(id);

    // Return the new user record — EXCLUDING password_hash
    const user = db.prepare(`
      SELECT
        u.id, u.username, u.email, u.display_name, u.role,
        u.is_active, u.created_at, p.id AS personnel_id
      FROM users u
      LEFT JOIN personnel p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(id);

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    console.error('[/api/users POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
