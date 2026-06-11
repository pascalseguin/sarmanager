import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { ISRID } from '@/lib/isrid';
import { formatUTM } from '@/lib/utm';

export async function GET(req: NextRequest) {
  const operationId = req.nextUrl.searchParams.get('operationId');
  const personnelId = req.nextUrl.searchParams.get('personnelId');
  if (!operationId) return NextResponse.json({ error: 'operationId required' }, { status: 400 });

  const op = db.prepare("SELECT * FROM operations WHERE id = ?").get(operationId) as any;
  if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

  let teamAssignment = null;
  if (personnelId) {
    teamAssignment = db.prepare(`
      SELECT t.name AS taskName, t.description, t.status, ta.is_team_leader
      FROM task_assignments ta JOIN tasks t ON ta.task_id = t.id
      WHERE ta.personnel_id = ? AND t.operation_id = ? AND t.status IN ('in_field','assignment_prepared')
      ORDER BY t.started_at DESC LIMIT 1
    `).get(personnelId, operationId) ?? null;
  }

  const caltopoUrl = op.caltopo_map_id
    ? `https://caltopo.com/m/${op.caltopo_map_id}`
    : (op.caltopo_map_url ?? null);

  const category = ISRID[op.subject_category ?? ''] ?? ISRID['hiker'];
  const elapsed = Math.floor((Date.now() - new Date(op.started_at).getTime()) / 60000);
  const ippDesc = op.ipp_type === 'pls' ? op.pls_location : op.last_seen_location;

  const smeac = [
    `=== SMEAC BRIEFING ===`,
    `${new Date().toLocaleString('en-CA')} — ${elapsed}m elapsed`,
    ``,
    `SITUATION`,
    `Tasked by ${op.tasking_agency ?? '—'} to locate ${op.lost_person_name ?? 'missing person'}${op.lost_person_age ? `, ${op.lost_person_age}y` : ''}.`,
    op.subject_circumstance ? `Circumstances: ${op.subject_circumstance}` : '',
    op.subject_condition ? `Medical: ${op.subject_condition}` : '',
    ``,
    `MISSION`,
    `Search assigned area and locate subject. Profile: ${category?.label ?? '—'}.`,
    ``,
    `EXECUTION`,
    `IPP: ${ippDesc ?? '—'}`,
    `Subject clothing: ${op.subject_clothing ?? 'not known'}.`,
    caltopoUrl ? `CalTopo: ${caltopoUrl}` : '',
    ``,
    `COMMAND & COMMS`,
    `Report to SAR Base. Check in every 30 minutes.`,
    ``,
    `SAFETY`,
    op.safety_concerns ? `Known hazards: ${op.safety_concerns}` : 'No specific hazards identified.',
  ].filter(Boolean).join('\n');

  const departureTime = op.deploy_timestamp
    ? new Date(new Date(op.deploy_timestamp).getTime() + 45 * 60 * 1000).toISOString()
    : null;

  const ippLat: number | null = op.ipp_type === 'pls' ? op.pls_lat : op.latitude;
  const ippLon: number | null = op.ipp_type === 'pls' ? op.pls_lon : op.longitude;
  const ippUtm = ippLat != null && ippLon != null ? formatUTM(ippLat, ippLon) : null;

  return NextResponse.json({
    operation: { name: op.name, status: op.status, startedAt: op.started_at, departureTime },
    teamAssignment,
    caltopoUrl,
    smeac,
    ippLat,
    ippLon,
    ippUtm,
    ippDesc: ippDesc ?? null,
  });
}
