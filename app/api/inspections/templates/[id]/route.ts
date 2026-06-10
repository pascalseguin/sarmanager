import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare('SELECT id FROM insp_templates WHERE id = ?').get(id))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { name, description, fields } = await req.json();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name !== undefined)        { sets.push('name = ?');        vals.push(name.trim()); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
  if (fields !== undefined)      { sets.push('fields_json = ?'); vals.push(JSON.stringify(fields)); }
  if (!sets.length) return NextResponse.json({ error: 'No fields' }, { status: 400 });
  vals.push(id);
  db.prepare(`UPDATE insp_templates SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM insp_templates WHERE id = ?').get(id) as any;
  return NextResponse.json({ template: { ...row, fields: JSON.parse(row.fields_json) } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  db.prepare('DELETE FROM insp_templates WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
