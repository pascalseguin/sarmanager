import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';
import { formatUTM } from '@/lib/utm';

function withUtm(op: Record<string, unknown>) {
  if (!op) return op;
  const lat = op.latitude as number | null;
  const lon = op.longitude as number | null;
  const plsLat = op.pls_lat as number | null;
  const plsLon = op.pls_lon as number | null;
  return {
    ...op,
    lkp_utm: lat && lon ? formatUTM(lat, lon) : 'N/A',
    pls_utm: plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A',
    active_ipp_utm: op.ipp_type === 'pls'
      ? (plsLat && plsLon ? formatUTM(plsLat, plsLon) : 'N/A')
      : (lat && lon ? formatUTM(lat, lon) : 'N/A'),
  };
}

const ALLOWED = [
  'name','description','status','operation_type','priority',
  'lost_person_name','lost_person_age','lost_person_description','subject_category',
  'subject_sex','subject_clothing','subject_gear','subject_condition','subject_circumstance',
  'last_seen_location','last_seen_time','latitude','longitude','lkp_notes',
  'pls_location','pls_lat','pls_lon','pls_time','reported_time','ipp_type','terrain_type',
  'tasking_agency','oic_name','oic_phone','mutual_aid_orgs','safety_concerns',
  'caltopo_map_id','caltopo_map_url','caltopo_features',
  'd4h_incident_id','d4h_exercise_id','d4h_activity_type','d4h_callout_id',
  'deploy_decision','deploy_timestamp','weather_snapshot',
];

// GET /api/operations/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ operation: withUtm(op as Record<string, unknown>) });
}

// PATCH /api/operations/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const b = await req.json();
    const updates: string[] = [];
    const vals: unknown[] = [];
    for (const f of ALLOWED) {
      if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); }
    }
    if (!updates.length) return NextResponse.json({ error: 'No fields' }, { status: 400 });
    updates.push("updated_at = datetime('now')", "sync_version = sync_version + 1");
    vals.push(id);
    db.prepare(`UPDATE operations SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
    return NextResponse.json({ operation: withUtm(op as Record<string, unknown>) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

// DELETE /api/operations/:id — soft close
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  db.prepare("UPDATE operations SET ended_at = datetime('now'), status = 'closed' WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
