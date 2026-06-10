import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ opId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { opId } = await params;

  const hasDeployments = (db.prepare(
    'SELECT COUNT(*) as n FROM operation_deployments WHERE operation_id = ?'
  ).get(opId) as any).n;

  if (hasDeployments === 0) {
    return NextResponse.json({
      equipment: db.prepare("SELECT * FROM equipment WHERE deployable = 1 AND status != 'retired' ORDER BY LOWER(name)").all()
    });
  }

  // Get all container entries from deployed presets
  const entries = db.prepare(`
    SELECT DISTINCT dpc.container_name
    FROM operation_deployments od
    JOIN deployment_preset_containers dpc ON od.preset_id = dpc.preset_id
    WHERE od.operation_id = ?
  `).all(opId) as { container_name: string }[];

  const wholeContainers: string[] = [];
  const subLocPairs: { container: string; loc: string }[] = [];
  for (const { container_name } of entries) {
    const sep = container_name.indexOf(' / ');
    if (sep >= 0) subLocPairs.push({ container: container_name.slice(0, sep), loc: container_name.slice(sep + 3) });
    else wholeContainers.push(container_name);
  }

  const all: any[] = [];
  if (wholeContainers.length) {
    const ph = wholeContainers.map(() => '?').join(',');
    all.push(...db.prepare(
      `SELECT * FROM equipment WHERE deployable = 1 AND status != 'retired' AND container IN (${ph})`
    ).all(...wholeContainers));
  }
  for (const { container, loc } of subLocPairs) {
    all.push(...db.prepare(
      "SELECT * FROM equipment WHERE deployable = 1 AND status != 'retired' AND container = ? AND TRIM(COALESCE(location,'')) = ?"
    ).all(container, loc));
  }

  const seen = new Set<string>();
  const items = all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
  return NextResponse.json({ equipment: items });
}
