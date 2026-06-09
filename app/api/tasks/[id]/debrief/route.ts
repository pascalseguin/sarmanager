import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// PUT /api/tasks/:id/debrief
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  try {
    const { debrief_notes } = await req.json();
    db.transaction(() => {
      db.prepare("UPDATE tasks SET status='debriefed', completed_at=datetime('now'), debrief_notes=?, updated_at=datetime('now') WHERE id=?")
        .run(debrief_notes ?? null, id);
      const assignments = db.prepare("SELECT personnel_id FROM task_assignments WHERE task_id = ?").all(id) as any[];
      for (const { personnel_id } of assignments) {
        db.prepare("UPDATE personnel SET status = 'available', updated_at = datetime('now') WHERE id = ?").run(personnel_id);
      }
    })();
    return NextResponse.json({ task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
