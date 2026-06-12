/**
 * app/api/checkin/attendance/route.ts — Record a searcher's check-in
 *
 * PURPOSE: Persist a searcher's fitness, drop-dead time, qualification confirmation,
 * and vehicle assignment to `searcher_checkins`.  Also best-effort posts attendance
 * to D4H so the incident's attendance list stays current.
 *
 * UNAUTHENTICATED (by design): This endpoint is called from the public check-in
 * portal (no session cookie required).  See app/api/checkin/auth/route.ts for the
 * rationale on why the check-in flow skips full authentication.
 *
 * IDEMPOTENT: If the same searcher submits again (e.g., browser back + re-submit),
 * the existing row is updated rather than creating a duplicate.  The check is on
 * (operation_id, searcher_name) — not perfect (two people with the same name on
 * the same operation) but acceptable in practice.
 *
 * D4H ATTENDANCE: Posted in a fire-and-forget pattern — failure to reach D4H does
 * NOT fail the check-in.  The check-in record exists in our DB regardless.
 *
 * SECURITY:
 *   - operationId is used in a parameterised query — no injection risk.
 *   - searcherName comes from the auth step which validated it against the roster.
 *     It is still parameterised in the SQL here.
 *   - No authentication token required by design (field accessibility).
 */

import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';

/**
 * Post attendance to D4H for the given member on the given activity.
 * Returns the D4H attendance record ID, or null if the call fails.
 * Errors are intentionally swallowed — D4H unavailability must not block check-in.
 */
async function postD4HAttendance(d4hMemberId: number, activityId: number): Promise<number | null> {
  try {
    const tokenRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_token'").get() as any;
    const teamRow  = db.prepare("SELECT value FROM config WHERE key = 'd4h_team_id'").get() as any;
    const token = tokenRow?.value; const teamId = teamRow?.value;
    if (!token || !teamId) return null;
    // D4H v3 Canadian API — POST to /attendance with memberId + activityId
    const res = await fetch(`https://api.team-manager.ca.d4h.com/v3/team/${teamId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: d4hMemberId, activityId, status: 'Attending' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.id ?? data?.id ?? null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const {
      operationId, personnelId, d4hMemberId, searcherName,
      fitForField, dropDeadTime, qualsConfirmed, qualsNote,
      vehicleRole, vehicleId, vehicleName,
    } = await req.json();

    if (!operationId || !searcherName || !dropDeadTime) {
      return NextResponse.json({ error: 'operationId, searcherName, and dropDeadTime are required.' }, { status: 400 });
    }

    // Best-effort D4H attendance posting (fail-open) — works for both incidents and exercises
    let d4hAttendanceId: number | null = null;
    const op = db.prepare("SELECT d4h_incident_id, d4h_exercise_id, created_by FROM operations WHERE id = ?").get(operationId) as any;
    const d4hActivityId = op?.d4h_incident_id ?? op?.d4h_exercise_id ?? null;
    if (d4hMemberId && d4hActivityId) {
      d4hAttendanceId = await postD4HAttendance(Number(d4hMemberId), Number(d4hActivityId));
    }

    const existing = db.prepare("SELECT id FROM searcher_checkins WHERE operation_id=? AND searcher_name=?").get(operationId, searcherName) as any;
    if (existing) {
      db.prepare(`UPDATE searcher_checkins SET fit_for_field=?,drop_dead_time=?,quals_confirmed=?,quals_note=?,vehicle_role=?,vehicle_id=?,vehicle_name=?,d4h_attendance_id=COALESCE(?,d4h_attendance_id) WHERE id=?`)
        .run(fitForField ? 1 : 0, dropDeadTime, qualsConfirmed ? 1 : 0, qualsNote ?? null,
          vehicleRole ?? null, vehicleId ?? null, vehicleName ?? null, d4hAttendanceId, existing.id);
    } else {
      db.prepare(`INSERT INTO searcher_checkins (id,operation_id,personnel_id,d4h_member_id,searcher_name,fit_for_field,drop_dead_time,quals_confirmed,quals_note,vehicle_role,vehicle_id,vehicle_name,d4h_attendance_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), operationId, personnelId ?? null, d4hMemberId ?? null, searcherName,
          fitForField ? 1 : 0, dropDeadTime, qualsConfirmed ? 1 : 0, qualsNote ?? null,
          vehicleRole ?? null, vehicleId ?? null, vehicleName ?? null, d4hAttendanceId);
    }

    // Flag quals concern to SM via event log
    if (!qualsConfirmed && qualsNote) {
      const op = db.prepare("SELECT created_by FROM operations WHERE id = ?").get(operationId) as any;
      db.prepare(`INSERT INTO events (id,operation_id,event_type,title,description,created_by,severity) VALUES (?,?,?,?,?,?,'warning')`)
        .run(randomUUID(), operationId, 'log',
          `Quals flag — ${searcherName}`,
          `${searcherName} flagged an inaccuracy in their qualifications: ${qualsNote}`,
          op?.created_by ?? 'system');
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
