import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { token, teamId } = await req.json();
    if (!token) return NextResponse.json({ error: 'd4hToken required' }, { status: 400 });

    // Fetch equipment from D4H v3
    const baseUrl = `https://api.d4h.com/v3/team/${teamId ?? ''}/equipment`;
    const res = await fetch(`${baseUrl}?size=1000`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `D4H ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    const items: any[] = data?.data ?? data?.results ?? data?.equipment ?? [];

    let created = 0;
    let updated = 0;
    for (const item of items) {
      const d4hId = item.id ?? item.equipment_id;
      const name  = item.title ?? item.name ?? 'Unknown';
      const ref   = item.ref ?? item.reference ?? null;
      const serial = item.serial_number ?? item.serial ?? null;
      const brand  = item.manufacturer ?? item.brand ?? null;
      const model  = item.model ?? null;
      const category = item.category?.title ?? item.category ?? null;
      const location = item.location?.title ?? item.location ?? null;
      const container = item.location?.parent?.title ?? null;
      const status = item.status === 'UNSERVICEABLE' ? 'retired' : 'available';

      const existing = db.prepare('SELECT id FROM equipment WHERE d4h_equipment_id = ?').get(d4hId);
      if (existing) {
        db.prepare(`
          UPDATE equipment SET name=?,brand=?,model=?,serial=?,ref=?,category=?,location=?,container=?,status=?,updated_at=datetime('now')
          WHERE d4h_equipment_id=?
        `).run(name, brand, model, serial, ref, category, location, container, status, d4hId);
        updated++;
      } else {
        db.prepare(`
          INSERT INTO equipment (id,d4h_equipment_id,name,brand,model,serial,ref,category,location,container,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(randomUUID(), d4hId, name, brand, model, serial, ref, category, location, container, status);
        created++;
      }
    }
    return NextResponse.json({ created, updated, total: items.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
