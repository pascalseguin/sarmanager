/**
 * app/api/operations/[id]/route.ts — Single operation CRUD
 *
 * ENDPOINTS:
 *   GET    /api/operations/:id  — Fetch one operation by ID
 *   PATCH  /api/operations/:id  — Update fields on an existing operation
 *   DELETE /api/operations/:id  — Soft-close an operation (sets ended_at)
 *
 * SECURITY:
 *   - All endpoints require SM or admin role.
 *   - PATCH uses an explicit ALLOWED field list to prevent mass-assignment
 *     (OWASP A03:2021 — Injection via uncontrolled field assignment).
 *   - DELETE is a soft delete (ended_at / status = 'closed') so that historical
 *     data is preserved and the action is reversible by an admin.
 *   - ID parameter is used directly in a parameterised query — no interpolation.
 *
 * VALIDATION:
 *   PATCH calls validateOperation() in non-strict mode (name not required) so
 *   partial updates are accepted while still catching bad field values (age out
 *   of range, invalid coordinates, etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';
import { formatUTM } from '@/lib/utm';
import { validateOperation, validationErrorBody } from '@/lib/validation';

// ─── UTM enrichment (same as collection route) ────────────────────────────────

function withUtm(op: Record<string, unknown>): Record<string, unknown> {
  if (!op) return op;
  const lat    = op.latitude  as number | null;
  const lon    = op.longitude as number | null;
  const plsLat = op.pls_lat   as number | null;
  const plsLon = op.pls_lon   as number | null;
  return {
    ...op,
    lkp_utm: lat && lon     ? formatUTM(lat, lon)         : 'N/A',
    pls_utm: plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A',
    active_ipp_utm: op.ipp_type === 'pls'
      ? (plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A')
      : (lat    && lon    ? formatUTM(lat, lon)        : 'N/A'),
  };
}

// ─── PATCH field allowlist ────────────────────────────────────────────────────

/**
 * Only these fields may be changed via PATCH.
 *
 * Fields intentionally excluded:
 *   id, created_by, created_at — immutable after creation
 *   ended_at                   — set only by the DELETE soft-close endpoint
 *   sync_version               — managed automatically in the UPDATE query
 *
 * Mass-assignment protection: the handler iterates this list and only writes
 * body keys that appear here.  A crafted request with `"id": "..."` is silently
 * ignored.
 */
const ALLOWED = [
  'name', 'description', 'status', 'operation_type', 'priority',
  'lost_person_name', 'lost_person_age', 'lost_person_description', 'subject_category',
  'subject_sex', 'subject_clothing', 'subject_gear', 'subject_condition', 'subject_circumstance',
  'last_seen_location', 'last_seen_time', 'latitude', 'longitude', 'lkp_notes',
  'pls_location', 'pls_lat', 'pls_lon', 'pls_time', 'reported_time', 'ipp_type', 'terrain_type',
  'tasking_agency', 'oic_name', 'oic_phone', 'mutual_aid_orgs', 'safety_concerns',
  'caltopo_map_id', 'caltopo_map_url', 'caltopo_features', 'requested_vehicles',
  'd4h_incident_id', 'd4h_exercise_id', 'd4h_activity_type', 'd4h_callout_id',
  'deploy_decision', 'deploy_timestamp', 'weather_snapshot',
  'ipp_direct_disabled', 'police_file_number',
] as const;

// ─── GET /api/operations/:id ──────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  const { id } = await params;
  const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
  if (!op) {
    return NextResponse.json({ error: 'Operation not found.' }, { status: 404 });
  }
  return NextResponse.json({ operation: withUtm(op as Record<string, unknown>) });
}

// ─── PATCH /api/operations/:id ────────────────────────────────────────────────

/**
 * Partial update — only the body fields present in ALLOWED are written.
 *
 * `sync_version` is incremented on every update so that clients polling the
 * operation can detect changes without fetching the full record.
 *
 * `updated_at` is refreshed to the current server time so audit trails are
 * accurate regardless of client clock skew.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  const { id } = await params;
  if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Operation not found.' }, { status: 404 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  // ── Validate the fields that are present ─────────────────────────────────
  // requireName = false: a PATCH doesn't need to supply the operation name
  const validation = validateOperation(b, /* requireName */ false);
  if (!validation.valid) {
    return NextResponse.json(validationErrorBody(validation.errors), { status: 400 });
  }

  try {
    // Build the SET clause from the allowlist (mass-assignment protection)
    const updates: string[]  = [];
    const vals:    unknown[] = [];

    for (const field of ALLOWED) {
      if (b[field] !== undefined) {
        updates.push(`${field} = ?`);
        vals.push(b[field]);
      }
    }

    if (!updates.length) {
      return NextResponse.json(
        { error: 'No recognised fields supplied.' },
        { status: 400 },
      );
    }

    // Always refresh updated_at and increment sync_version
    updates.push("updated_at = datetime('now')", "sync_version = sync_version + 1");
    vals.push(id);

    db.prepare(`UPDATE operations SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

    const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
    return NextResponse.json({ operation: withUtm(op as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[/api/operations PATCH] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// ─── DELETE /api/operations/:id ───────────────────────────────────────────────

/**
 * Soft-close an operation.
 *
 * WHY SOFT DELETE: SAR operations generate important legal and statistical records
 * (person located, time-to-locate, resources deployed).  Hard-deleting this data
 * would violate record-keeping obligations.  Setting ended_at / status = 'closed'
 * removes the operation from the active list while preserving the data.
 *
 * A hard delete (if ever needed for GDPR/privacy reasons) should require explicit
 * confirmation and an admin role, and should be a separate endpoint.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  const { id } = await params;
  if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Operation not found.' }, { status: 404 });
  }

  db.prepare(
    "UPDATE operations SET ended_at = datetime('now'), status = 'closed' WHERE id = ?"
  ).run(id);

  return NextResponse.json({ success: true });
}
