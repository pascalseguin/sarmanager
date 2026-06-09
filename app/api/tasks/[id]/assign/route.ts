import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// POST /api/tasks/:id/assign
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  try {
    const { personnel_ids, team_leader_id } = await req.json();
    if (!Array.isArray(personnel_ids) || !personnel_ids.length) {
      return NextResponse.json({ error: 'personnel_ids array required' }, { status: 400 });
    }
    db.transaction(() => {
      db.prepare("DELETE FROM task_assignments WHERE task_id = ?").run(id);
      for (const pid of personnel_ids) {
        db.prepare("INSERT INTO task_assignments (id, task_id, personnel_id, is_team_leader) VALUES (?,?,?,?)")
          .run(randomUUID(), id, pid, pid === team_leader_id ? 1 : 0);
        db.prepare("UPDATE personnel SET status = 'deployed', updated_at = datetime('now') WHERE id = ?").run(pid);
      }
      db.prepare("UPDATE tasks SET status = 'in_field', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    })();
    return NextResponse.json({ success: true, assigned: personnel_ids.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
