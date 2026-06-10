import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// POST { rows: [{name, brand, model, serial, barcode, type, location, container, tag}] }
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { rows } = await req.json() as { rows: Record<string, string>[] };
    if (!Array.isArray(rows) || !rows.length)
      return NextResponse.json({ error: 'rows required' }, { status: 400 });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = (row.name ?? '').trim();
      if (!name) { skipped++; continue; }

      // Deduplicate on barcode or serial
      const existing = (row.barcode && db.prepare('SELECT id FROM equipment WHERE barcode = ?').get(row.barcode))
        || (row.serial && db.prepare('SELECT id FROM equipment WHERE serial = ?').get(row.serial));
      if (existing) { skipped++; continue; }

      try {
        db.prepare(`
          INSERT INTO equipment (id,name,brand,model,serial,barcode,type,location,container,tag)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(randomUUID(), name,
          row.brand ?? null, row.model ?? null, row.serial ?? null, row.barcode ?? null,
          row.type ?? null, row.location ?? null, row.container ?? null, row.tag ?? null);
        created++;
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
      }
    }
    return NextResponse.json({ created, skipped, errors });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
