import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const TASK_FIELDS = ['status', 'name', 'task_number', 'task_type', 'description', 'started_at', 'completed_at', 'debrief_notes', 'caltopo_folder_id', 'search_type', 'team_type', 'current_assignment', 'planned_tasks'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM tasks WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await req.json();
    const updates: string[] = [];
    const vals: unknown[] = [];
    for (const f of TASK_FIELDS) {
      if (body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(body[f]); }
    }
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      vals.push(id);
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }

    // Manage assignments: assign_add = { personnel_id, is_team_leader? }
    if (body.assign_add) {
      const { personnel_id, is_team_leader = 0 } = body.assign_add;
      const existing = db.prepare("SELECT id FROM task_assignments WHERE task_id = ? AND personnel_id = ?").get(id, personnel_id);
      if (!existing) {
        db.prepare("INSERT INTO task_assignments (id, task_id, personnel_id, is_team_leader) VALUES (?, ?, ?, ?)")
          .run(randomUUID(), id, personnel_id, is_team_leader ? 1 : 0);
      }
    }
    if (body.assign_remove) {
      db.prepare("DELETE FROM task_assignments WHERE task_id = ? AND personnel_id = ?").run(id, body.assign_remove);
    }

    const task = db.prepare(`
      SELECT t.*,
        (SELECT json_group_array(json_object('id',ta.id,'personnel_id',ta.personnel_id,'is_team_leader',ta.is_team_leader,'name',p.name))
         FROM task_assignments ta JOIN personnel p ON p.id = ta.personnel_id WHERE ta.task_id = t.id) AS assignments
      FROM tasks t WHERE t.id = ?
    `).get(id) as any;
    return NextResponse.json({ task: { ...task, assignments: JSON.parse(task.assignments || '[]') } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM tasks WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
