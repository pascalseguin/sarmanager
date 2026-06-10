import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const rows = db.prepare('SELECT * FROM insp_templates ORDER BY name').all() as any[];
  return NextResponse.json({ templates: rows.map(r => ({ ...r, fields: JSON.parse(r.fields_json ?? '[]') })) });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { name, description, fields } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    db.prepare('INSERT INTO insp_templates (id, name, description, fields_json) VALUES (?,?,?,?)')
      .run(id, name.trim(), description?.trim() ?? '', JSON.stringify(fields ?? []));
    const row = db.prepare('SELECT * FROM insp_templates WHERE id = ?').get(id) as any;
    return NextResponse.json({ template: { ...row, fields: JSON.parse(row.fields_json) } }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
