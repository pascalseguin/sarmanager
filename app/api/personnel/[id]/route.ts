import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const ALLOWED = ['name','role','status','qualifications','contact','phone','notes','member_status'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  const p = db.prepare("SELECT * FROM personnel WHERE id = ?").get(id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ personnel: p });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM personnel WHERE id = ?").get(id)) {
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
    updates.push("updated_at = datetime('now')");
    vals.push(id);
    db.prepare(`UPDATE personnel SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    return NextResponse.json({ personnel: db.prepare("SELECT * FROM personnel WHERE id = ?").get(id) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM personnel WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  db.prepare("DELETE FROM personnel WHERE id = ?").run(id);
  // Remove D4H link so the member can be reimported cleanly
  db.prepare("UPDATE d4h_member_map SET local_personnel_id = NULL WHERE local_personnel_id = ?").run(id);
  return NextResponse.json({ success: true });
}
