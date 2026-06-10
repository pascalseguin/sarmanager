import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ opId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { opId } = await params;
  const rows = db.prepare(`
    SELECT od.id, od.preset_id, od.deployed_at, dp.name as preset_name
    FROM operation_deployments od
    JOIN deployment_presets dp ON od.preset_id = dp.id
    WHERE od.operation_id = ?
  `).all(opId) as any[];
  for (const r of rows) {
    r.containers = (db.prepare(
      'SELECT container_name FROM deployment_preset_containers WHERE preset_id = ? ORDER BY container_name'
    ).all(r.preset_id) as any[]).map((c: any) => c.container_name);
  }
  return NextResponse.json({ deployments: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ opId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { opId } = await params;
  const { presetId } = await req.json();
  if (!presetId) return NextResponse.json({ error: 'presetId required' }, { status: 400 });
  if (!db.prepare('SELECT id FROM deployment_presets WHERE id = ?').get(presetId))
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  const existing = db.prepare('SELECT id FROM operation_deployments WHERE operation_id = ? AND preset_id = ?').get(opId, presetId);
  if (existing) return NextResponse.json({ success: true, alreadyDeployed: true });
  const id = randomUUID();
  db.prepare('INSERT INTO operation_deployments (id, operation_id, preset_id) VALUES (?,?,?)').run(id, opId, presetId);
  return NextResponse.json({ success: true, id });
}
