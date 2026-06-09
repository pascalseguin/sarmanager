import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// GET /api/personnel?operation_id=
export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const opId = req.nextUrl.searchParams.get('operation_id');
  const roster = db.prepare(`
    SELECT p.*, m.d4h_member_id,
           c.id AS checkin_id, c.fit_for_field, c.drop_dead_time
    FROM personnel p
    LEFT JOIN d4h_member_map m ON m.local_personnel_id = p.id
    LEFT JOIN searcher_checkins c ON c.personnel_id = p.id AND (? IS NULL OR c.operation_id = ?)
    WHERE p.operation_id IS NULL
    ORDER BY p.name
  `).all(opId, opId);
  return NextResponse.json({ personnel: roster });
}

// POST /api/personnel
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { name, role, status, qualifications, contact, phone, notes } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    db.prepare(`INSERT INTO personnel (id, name, role, status, qualifications, contact, phone, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, role ?? null, status ?? 'available', qualifications ?? null, contact ?? null, phone ?? null, notes ?? null);
    return NextResponse.json({ personnel: db.prepare("SELECT * FROM personnel WHERE id = ?").get(id) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
