import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { token, teamId } = await req.json();
    if (!token) return NextResponse.json({ error: 'd4hToken required' }, { status: 400 });

    // Fetch equipment from D4H v3 (Canadian base URL)
    const baseUrl = `https://api.team-manager.ca.d4h.com/v3/team/${teamId ?? ''}/equipment`;
    const res = await fetch(`${baseUrl}?size=1000`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `D4H ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    const items: any[] = data?.data ?? data?.results ?? data?.equipment ?? [];

    // Safely extract a string/null from a D4H field that may be a nested object
    function toStr(v: unknown): string | null {
      if (v == null) return null;
      if (typeof v === 'string') return v || null;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const s = o.title ?? o.name ?? o.label ?? null;
        return s != null ? String(s) : null;
      }
      return null;
    }

    let created = 0;
    let updated = 0;
    for (const item of items) {
      // Skip retired items — D4H uses RETIRED status for decommissioned equipment
      const d4hStatus: string = String(item.status ?? '').toUpperCase();
      if (d4hStatus === 'RETIRED') continue;

      const d4hId = item.id ?? item.equipment_id;
      // Name resolution: title > kind/type name (+ref suffix) > brand+model > ref > placeholder
      const kindTitle = toStr(item.kind?.title ?? item.type?.title ?? item.kind_title ?? item.type_title);
      const refStr    = toStr(item.ref ?? item.reference);
      const brandStr  = toStr(item.manufacturer ?? item.brand);
      const modelStr  = toStr(item.model);
      const brandModel = [brandStr, modelStr].filter(Boolean).join(' ') || null;
      const kindWithRef = kindTitle
        ? (refStr ? `${kindTitle} (${refStr})` : kindTitle)
        : null;
      const name = toStr(item.title) ?? kindWithRef ?? brandModel ?? refStr ?? `D4H #${d4hId}`;
      const ref   = toStr(item.ref ?? item.reference);
      const serial = toStr(item.serial_number ?? item.serial);
      const brand  = toStr(item.manufacturer ?? item.brand);
      const model  = toStr(item.model);
      // D4H v3 may return category as singular object, plural array, or nested under kind
      const categoryRaw = item.category
        ?? (Array.isArray(item.categories) ? item.categories[0] : null)
        ?? item.kind?.category
        ?? item.equipment_category;
      const category = toStr(categoryRaw);
      const location = toStr(item.location?.title != null ? item.location.title : item.location);
      const container = toStr(item.location?.parent?.title ?? item.location?.parent);
      const status = d4hStatus === 'UNSERVICEABLE' ? 'retired' : 'available';

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
    return NextResponse.json({ created, updated, total: items.length, rawSample: items[0] ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
