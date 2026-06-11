import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// GET /api/personnel?operation_id=
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const opId = req.nextUrl.searchParams.get('operation_id');

  let roster: unknown[];
  if (opId) {
    // For a specific operation: join checkins for that operation only
    roster = db.prepare(`
      SELECT p.*, m.d4h_member_id,
             c.id AS checkin_id, c.fit_for_field, c.drop_dead_time
      FROM personnel p
      LEFT JOIN (SELECT d4h_member_id, local_personnel_id FROM d4h_member_map GROUP BY local_personnel_id) m
             ON m.local_personnel_id = p.id
      LEFT JOIN searcher_checkins c ON c.personnel_id = p.id AND c.operation_id = ?
      WHERE p.operation_id IS NULL
      ORDER BY p.name
    `).all(opId);
  } else {
    // Global roster: no checkin join needed, one row per person guaranteed
    roster = db.prepare(`
      SELECT p.*, m.d4h_member_id
      FROM personnel p
      LEFT JOIN (SELECT d4h_member_id, local_personnel_id FROM d4h_member_map GROUP BY local_personnel_id) m
             ON m.local_personnel_id = p.id
      WHERE p.operation_id IS NULL
      ORDER BY p.name
    `).all();
  }
  return NextResponse.json({ personnel: roster });
}

// POST /api/personnel
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { name, role, status, qualifications, contact, phone, notes, member_status, d4h_member_id } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    db.prepare(`INSERT INTO personnel (id, name, role, status, qualifications, contact, phone, notes, member_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, role ?? null, status ?? 'available', qualifications ?? null, contact ?? null, phone ?? null, notes ?? null, member_status ?? null);

    // Link to D4H member if provided
    if (d4h_member_id) {
      const existing = db.prepare('SELECT id FROM d4h_member_map WHERE d4h_member_id = ?').get(d4h_member_id) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE d4h_member_map SET local_personnel_id = ?, d4h_member_name = ?, synced_at = datetime('now') WHERE d4h_member_id = ?")
          .run(id, name, d4h_member_id);
      } else {
        db.prepare("INSERT INTO d4h_member_map (id, d4h_member_id, d4h_member_name, local_personnel_id, synced_at) VALUES (?, ?, ?, ?, datetime('now'))")
          .run(randomUUID(), d4h_member_id, name, id);
      }
    }

    return NextResponse.json({ personnel: db.prepare("SELECT * FROM personnel WHERE id = ?").get(id) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
