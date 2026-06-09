import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const opId = req.nextUrl.searchParams.get('operation_id');
  if (!opId) return NextResponse.json({ error: 'operation_id required' }, { status: 400 });
  const events = db.prepare("SELECT * FROM events WHERE operation_id = ? ORDER BY created_at DESC").all(opId);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { operation_id, event_type, title, description, latitude, longitude, location_description, severity } = await req.json();
    if (!operation_id || !title) return NextResponse.json({ error: 'operation_id and title required' }, { status: 400 });
    if (!db.prepare("SELECT id FROM operations WHERE id = ?").get(operation_id)) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO events (id, operation_id, event_type, title, description, created_by, latitude, longitude, location_description, severity)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, operation_id, event_type ?? 'log', title, description ?? null, result.id,
        latitude ?? null, longitude ?? null, location_description ?? null, severity ?? 'info');
    return NextResponse.json({ event: db.prepare("SELECT * FROM events WHERE id = ?").get(id) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
