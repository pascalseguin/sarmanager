/**
 * app/api/operations/route.ts — Operation collection (list + create)
 *
 * ENDPOINTS:
 *   GET  /api/operations  — List all active operations
 *   POST /api/operations  — Create a new operation
 *
 * SECURITY:
 *   - Both endpoints require SM or admin role (requireSM guard).
 *   - POST validates input via validateOperation() before any DB write.
 *   - Field names for INSERT are taken from the OP_FIELDS allowlist, not
 *     directly from the request body — prevents mass-assignment injection.
 *   - Coordinates are validated to prevent garbage lat/lon values that would
 *     break CalTopo / map rendering.
 *
 * PERFORMANCE:
 *   GET returns only non-closed operations (ended_at IS NULL) to keep the
 *   result set small.  For historical queries, add a separate /api/operations/history
 *   endpoint with pagination when the archive grows large.
 *
 * REFERENCES:
 *   OWASP A03:2021 — Injection (field allowlist, parameterised queries)
 *   OWASP A01:2021 — Broken Access Control (requireSM on all endpoints)
 */

import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';
import { formatUTM } from '@/lib/utm';
import { validateOperation, validationErrorBody } from '@/lib/validation';

// ─── UTM enrichment ───────────────────────────────────────────────────────────

/**
 * Add computed UTM coordinate strings to an operation object.
 *
 * WHY: The frontend always displays coordinates in UTM format (SAR standard).
 * Computing them here means every component gets consistent UTM strings without
 * duplicating the conversion logic.
 *
 * The three fields added:
 *   lkp_utm        — UTM of the Last Known Point (latitude/longitude columns)
 *   pls_utm        — UTM of the Point Last Seen (pls_lat/pls_lon columns)
 *   active_ipp_utm — UTM of whichever IPP is active (pls or lkp per ipp_type)
 */
function withUtm(op: Record<string, unknown>): Record<string, unknown> {
  if (!op) return op;

  const lat    = op.latitude  as number | null;
  const lon    = op.longitude as number | null;
  const plsLat = op.pls_lat   as number | null;
  const plsLon = op.pls_lon   as number | null;

  return {
    ...op,
    lkp_utm: lat && lon   ? formatUTM(lat, lon)     : 'N/A',
    pls_utm: plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A',
    active_ipp_utm: op.ipp_type === 'pls'
      ? (plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A')
      : (lat    && lon    ? formatUTM(lat,    lon)    : 'N/A'),
  };
}

// ─── Field allowlist ──────────────────────────────────────────────────────────

/**
 * Explicit allowlist of operation fields that may be set via the API.
 *
 * SECURITY (Mass-Assignment Prevention):
 *   By constructing the INSERT from this list — not from Object.keys(body) —
 *   we ensure that a crafted request cannot set system-managed fields like
 *   `id`, `created_by`, `ended_at`, or any column not listed here.
 *   OWASP A03:2021 (Injection via mass-assignment is a variant of this risk).
 */
const OP_FIELDS = [
  'name', 'description', 'status', 'operation_type', 'priority',
  'lost_person_name', 'lost_person_age', 'lost_person_description', 'subject_category',
  'subject_sex', 'subject_clothing', 'subject_gear', 'subject_condition', 'subject_circumstance',
  'last_seen_location', 'last_seen_time', 'latitude', 'longitude', 'lkp_notes',
  'pls_location', 'pls_lat', 'pls_lon', 'pls_time', 'reported_time', 'ipp_type', 'terrain_type',
  'tasking_agency', 'oic_name', 'oic_phone', 'mutual_aid_orgs', 'safety_concerns',
  'caltopo_map_id', 'caltopo_map_url',
  'd4h_incident_id', 'd4h_exercise_id', 'd4h_activity_type', 'd4h_callout_id',
  'deploy_decision', 'deploy_timestamp', 'weather_snapshot',
  'deployed_presets_json', 'ipp_direct_disabled', 'police_file_number',
] as const;

// ─── GET /api/operations ──────────────────────────────────────────────────────

/**
 * Return all currently-active operations (ended_at IS NULL), ordered by
 * priority (ascending — 1 = highest priority) then by start time (newest first).
 *
 * Each operation is enriched with computed UTM fields (see withUtm()).
 */
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  const ops = db.prepare(
    "SELECT * FROM operations WHERE ended_at IS NULL ORDER BY priority ASC, started_at DESC"
  ).all();

  return NextResponse.json({
    operations: ops.map(o => withUtm(o as Record<string, unknown>)),
  });
}

// ─── POST /api/operations ─────────────────────────────────────────────────────

/**
 * Create a new operation.
 *
 * After creation, if `deployed_presets_json` was supplied, the preset IDs are
 * synced into `operation_deployments` immediately.  This ensures that equipment
 * and vehicle filtering (which query `operation_deployments`) works from the
 * first second the operation exists, without waiting for a separate deploy step.
 */
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;

  // ── Parse body ────────────────────────────────────────────────────────────
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  // ── Validate input ────────────────────────────────────────────────────────
  const validation = validateOperation(b, /* requireName */ true);
  if (!validation.valid) {
    return NextResponse.json(validationErrorBody(validation.errors), { status: 400 });
  }

  try {
    const id = randomUUID();

    // Build INSERT from the allowlist — only include fields present in the body
    const presentFields = OP_FIELDS.filter(f => b[f] !== undefined);
    const cols  = ['id', 'created_by', ...presentFields];
    const vals  = [id, result.id, ...presentFields.map(f => b[f] ?? null)];

    db.prepare(
      `INSERT INTO operations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    ).run(...vals);

    // ── Sync deployed_presets_json → operation_deployments ────────────────
    // When the SM selects preset containers during rollout, those preset IDs
    // are saved in deployed_presets_json.  We immediately mirror them into
    // the operation_deployments table so equipment/vehicle filtering (which
    // JOINs on that table) works without an extra API call.
    if (b.deployed_presets_json) {
      try {
        const presetIds: string[] = JSON.parse(b.deployed_presets_json as string);
        for (const presetId of presetIds) {
          // Only insert if the preset actually exists (referential integrity check)
          if (db.prepare('SELECT id FROM deployment_presets WHERE id = ?').get(presetId)) {
            const exists = db.prepare(
              'SELECT id FROM operation_deployments WHERE operation_id = ? AND preset_id = ?'
            ).get(id, presetId);
            if (!exists) {
              db.prepare(
                'INSERT INTO operation_deployments (id, operation_id, preset_id) VALUES (?, ?, ?)'
              ).run(randomUUID(), id, presetId);
            }
          }
        }
      } catch {
        // Malformed JSON in deployed_presets_json — log and continue.
        // The operation was already created; this is non-fatal.
        console.warn('[/api/operations POST] Could not parse deployed_presets_json — skipping sync');
      }
    }

    const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
    return NextResponse.json(
      { operation: withUtm(op as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error('[/api/operations POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
