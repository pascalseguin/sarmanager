import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { vehicleId, vehicleName, checklistItems, searcherName, operationId } = await req.json();
    const notes = `Pre-departure safety checklist completed by ${searcherName}.\nChecked: ${(checklistItems as string[]).join(', ')}.`;

    db.prepare("UPDATE searcher_checkins SET inspection_submitted=1 WHERE operation_id=? AND searcher_name=?")
      .run(operationId, searcherName);

    const op = db.prepare("SELECT created_by FROM operations WHERE id = ?").get(operationId) as any;
    db.prepare(`INSERT INTO events (id,operation_id,event_type,title,description,created_by,severity) VALUES (?,?,?,?,?,?,'info')`)
      .run(randomUUID(), operationId, 'deployment',
        `Vehicle inspection — ${vehicleName}`, notes, op?.created_by ?? 'system');

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
