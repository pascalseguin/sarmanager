import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const ALLOWED = ['name','brand','model','serial','barcode','ref','type','category','location','container','status','deployable','notes','tag','custom_tags'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare('SELECT id FROM equipment WHERE id = ?').get(id))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = await req.json();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of ALLOWED) {
      if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(body[f]); }
    }
    if (!sets.length) return NextResponse.json({ error: 'No fields' }, { status: 400 });
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    db.prepare(`UPDATE equipment SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return NextResponse.json({ equipment: db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare('SELECT id FROM equipment WHERE id = ?').get(id))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
