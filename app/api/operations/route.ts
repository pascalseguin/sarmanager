import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
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

const OP_FIELDS = [
  'name','description','status','operation_type','priority',
  'lost_person_name','lost_person_age','lost_person_description','subject_category',
  'subject_sex','subject_clothing','subject_gear','subject_condition','subject_circumstance',
  'last_seen_location','last_seen_time','latitude','longitude','lkp_notes',
  'pls_location','pls_lat','pls_lon','pls_time','reported_time','ipp_type','terrain_type',
  'tasking_agency','oic_name','oic_phone','mutual_aid_orgs','safety_concerns',
  'caltopo_map_id','caltopo_map_url',
  'd4h_incident_id','d4h_exercise_id','d4h_activity_type','d4h_callout_id',
  'deploy_decision','deploy_timestamp','weather_snapshot',
  'deployed_presets_json',
] as const;

// GET /api/operations
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const ops = db.prepare("SELECT * FROM operations WHERE ended_at IS NULL ORDER BY priority ASC, started_at DESC").all();
  return NextResponse.json({ operations: ops.map(o => withUtm(o as Record<string, unknown>)) });
}

// POST /api/operations
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const b = await req.json();
    if (!b.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    const cols = ['id', 'created_by', ...OP_FIELDS.filter(f => b[f] !== undefined)];
    const vals = [id, result.id, ...OP_FIELDS.filter(f => b[f] !== undefined).map(f => b[f] ?? null)];
    db.prepare(`INSERT INTO operations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    // Sync deployed_presets_json → operation_deployments so equipment/vehicle filtering works immediately
    if (b.deployed_presets_json) {
      try {
        const presetIds: string[] = JSON.parse(b.deployed_presets_json);
        for (const presetId of presetIds) {
          if (db.prepare('SELECT id FROM deployment_presets WHERE id = ?').get(presetId)) {
            const exists = db.prepare('SELECT id FROM operation_deployments WHERE operation_id = ? AND preset_id = ?').get(id, presetId);
            if (!exists) db.prepare('INSERT INTO operation_deployments (id, operation_id, preset_id) VALUES (?,?,?)').run(randomUUID(), id, presetId);
          }
        }
      } catch { /* malformed JSON — skip */ }
    }
    const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(id);
    return NextResponse.json({ operation: withUtm(op as Record<string, unknown>) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
