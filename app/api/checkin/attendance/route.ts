import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const {
      operationId, personnelId, d4hMemberId, searcherName,
      fitForField, dropDeadTime, qualsConfirmed, qualsNote,
      vehicleRole, vehicleId, vehicleName,
    } = await req.json();

    if (!operationId || !searcherName || !dropDeadTime) {
      return NextResponse.json({ error: 'operationId, searcherName, and dropDeadTime are required.' }, { status: 400 });
    }

    const existing = db.prepare("SELECT id FROM searcher_checkins WHERE operation_id=? AND searcher_name=?").get(operationId, searcherName) as any;
    if (existing) {
      db.prepare(`UPDATE searcher_checkins SET fit_for_field=?,drop_dead_time=?,quals_confirmed=?,quals_note=?,vehicle_role=?,vehicle_id=?,vehicle_name=? WHERE id=?`)
        .run(fitForField ? 1 : 0, dropDeadTime, qualsConfirmed ? 1 : 0, qualsNote ?? null,
          vehicleRole ?? null, vehicleId ?? null, vehicleName ?? null, existing.id);
    } else {
      db.prepare(`INSERT INTO searcher_checkins (id,operation_id,personnel_id,d4h_member_id,searcher_name,fit_for_field,drop_dead_time,quals_confirmed,quals_note,vehicle_role,vehicle_id,vehicle_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), operationId, personnelId ?? null, d4hMemberId ?? null, searcherName,
          fitForField ? 1 : 0, dropDeadTime, qualsConfirmed ? 1 : 0, qualsNote ?? null,
          vehicleRole ?? null, vehicleId ?? null, vehicleName ?? null);
    }

    // Flag quals concern to SM via event log
    if (!qualsConfirmed && qualsNote) {
      const op = db.prepare("SELECT created_by FROM operations WHERE id = ?").get(operationId) as any;
      db.prepare(`INSERT INTO events (id,operation_id,event_type,title,description,created_by,severity) VALUES (?,?,?,?,?,?,'warning')`)
        .run(randomUUID(), operationId, 'log',
          `Quals flag — ${searcherName}`,
          `${searcherName} flagged an inaccuracy in their qualifications: ${qualsNote}`,
          op?.created_by ?? 'system');
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
