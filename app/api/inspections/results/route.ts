import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const opId       = req.nextUrl.searchParams.get('operation_id');
  const equipId    = req.nextUrl.searchParams.get('equipment_id');
  const templateId = req.nextUrl.searchParams.get('template_id');
  let sql = 'SELECT * FROM insp_results';
  const where: string[] = [];
  const vals: unknown[] = [];
  if (opId)       { where.push('operation_id = ?');  vals.push(opId); }
  if (equipId)    { where.push('equipment_id = ?');  vals.push(Number(equipId)); }
  if (templateId) { where.push('template_id = ?');   vals.push(templateId); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY completed_at DESC LIMIT 500';
  const rows = db.prepare(sql).all(...vals) as any[];
  return NextResponse.json({ results: rows.map(r => ({ ...r, fieldResults: JSON.parse(r.field_results_json ?? '[]') })) });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const body = await req.json();
    const { templateId, templateName, equipmentId, equipmentName, operationId, completedBy, fieldResults, overallPassed, containerName } = body;
    if (!templateName || !equipmentName || !completedBy)
      return NextResponse.json({ error: 'templateName, equipmentName, completedBy required' }, { status: 400 });
    const id = randomUUID();
    db.prepare(`
      INSERT INTO insp_results (id,template_id,template_name,equipment_id,equipment_name,operation_id,completed_by,overall_passed,field_results_json,container_name)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, templateId ?? null, templateName, equipmentId ?? null, equipmentName,
      operationId ?? null, completedBy, overallPassed ? 1 : 0,
      JSON.stringify(fieldResults ?? []), containerName ?? null);
    const row = db.prepare('SELECT * FROM insp_results WHERE id = ?').get(id) as any;
    return NextResponse.json({ result: { ...row, fieldResults: JSON.parse(row.field_results_json) } }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
