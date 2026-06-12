import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// PATCH /api/checkin/:id  — currently used to update last_heard_at (radio check-in confirmation)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.prepare("SELECT id FROM searcher_checkins WHERE id = ?").get(id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = await req.json();
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.last_heard_at !== undefined) { updates.push('last_heard_at = ?'); vals.push(body.last_heard_at); }
    if (body.drop_dead_time !== undefined) { updates.push('drop_dead_time = ?'); vals.push(body.drop_dead_time); }
    if (!updates.length) return NextResponse.json({ error: 'No fields' }, { status: 400 });
    vals.push(id);
    db.prepare(`UPDATE searcher_checkins SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    return NextResponse.json({ checkin: db.prepare("SELECT * FROM searcher_checkins WHERE id = ?").get(id) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
