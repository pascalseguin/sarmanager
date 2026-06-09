import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// GET /api/tasks?operation_id=
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const opId = req.nextUrl.searchParams.get('operation_id');
  if (!opId) return NextResponse.json({ error: 'operation_id required' }, { status: 400 });
  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT json_group_array(json_object('id',ta.id,'personnel_id',ta.personnel_id,'is_team_leader',ta.is_team_leader,'name',p.name))
       FROM task_assignments ta JOIN personnel p ON p.id = ta.personnel_id WHERE ta.task_id = t.id) AS assignments
    FROM tasks t WHERE t.operation_id = ? ORDER BY t.created_at ASC
  `).all(opId);
  return NextResponse.json({ tasks: tasks.map((t: any) => ({ ...t, assignments: JSON.parse(t.assignments || '[]') })) });
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { operation_id, task_number, name, task_type, description, caltopo_folder_id } = await req.json();
    if (!operation_id || !name) return NextResponse.json({ error: 'operation_id and name required' }, { status: 400 });
    if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(operation_id)) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO tasks (id, operation_id, task_number, name, task_type, description, caltopo_folder_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, operation_id, task_number ?? null, name, task_type ?? null, description ?? null, caltopo_folder_id ?? null, result.id);
    return NextResponse.json({ task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
