import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const EQ_FIELDS = ['name','brand','model','serial','barcode','ref','type','category','location','container','status','deployable','notes','tag','d4h_equipment_id','custom_tags'];

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const container   = req.nextUrl.searchParams.get('container');
  const status      = req.nextUrl.searchParams.get('status');
  const vehicleOnly = req.nextUrl.searchParams.get('vehicleOnly') === 'true';
  let sql = 'SELECT id,name,ref,type,category,status FROM equipment';
  const where: string[] = ['status != ?'];
  const vals: unknown[] = ['retired'];
  if (container) { where.push('container = ?'); vals.push(container); }
  if (status)    { where.push('status = ?');    vals.push(status); }
  if (vehicleOnly) {
    where.push(`(UPPER(type) LIKE '%VEHICLE%' OR UPPER(type) LIKE '%TRUCK%' OR UPPER(type) LIKE '%VAN%' OR UPPER(type) LIKE '%UTV%' OR UPPER(type) LIKE '%ATV%' OR UPPER(category) LIKE '%VEHICLE%')`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY LOWER(name)';
  // Full record requested without vehicleOnly filter (original behaviour for equipment page)
  if (!vehicleOnly) {
    sql = 'SELECT * FROM equipment';
    const w2: string[] = []; const v2: unknown[] = [];
    if (container) { w2.push('container = ?'); v2.push(container); }
    if (status)    { w2.push('status = ?');    v2.push(status); }
    if (w2.length) sql += ' WHERE ' + w2.join(' AND ');
    sql += ' ORDER BY LOWER(name)';
    return NextResponse.json({ equipment: db.prepare(sql).all(...v2) });
  }
  return NextResponse.json({ items: db.prepare(sql).all(...vals) });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const body = await req.json();
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    const cols = ['id', 'name'];
    const placeholders = ['?', '?'];
    const vals: unknown[] = [id, name.trim()];
    for (const f of EQ_FIELDS.filter(f => f !== 'name')) {
      if (body[f] !== undefined && body[f] !== null && body[f] !== '') {
        cols.push(f); placeholders.push('?'); vals.push(body[f]);
      }
    }
    db.prepare(`INSERT INTO equipment (${cols.join(',')}) VALUES (${placeholders.join(',')})`).run(...vals);
    return NextResponse.json({ equipment: db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
