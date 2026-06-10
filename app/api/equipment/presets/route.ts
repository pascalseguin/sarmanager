import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

function hydratePreset(p: any) {
  p.containers = (db.prepare(
    'SELECT container_name FROM deployment_preset_containers WHERE preset_id = ? ORDER BY container_name'
  ).all(p.id) as any[]).map((r: any) => r.container_name);
  return p;
}

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const rows = db.prepare('SELECT * FROM deployment_presets ORDER BY LOWER(name)').all() as any[];
  return NextResponse.json({ presets: rows.map(hydratePreset) });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { name, description } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = randomUUID();
    db.prepare('INSERT INTO deployment_presets (id,name,description) VALUES (?,?,?)')
      .run(id, name.trim(), description?.trim() ?? null);
    return NextResponse.json({ preset: hydratePreset(db.prepare('SELECT * FROM deployment_presets WHERE id = ?').get(id)) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
