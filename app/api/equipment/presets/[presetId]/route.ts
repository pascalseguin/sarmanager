import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { presetId } = await params;
  if (!db.prepare('SELECT id FROM deployment_presets WHERE id = ?').get(presetId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { name, description } = await req.json();
  if (name !== undefined) db.prepare('UPDATE deployment_presets SET name = ? WHERE id = ?').run(name.trim(), presetId);
  if (description !== undefined) db.prepare('UPDATE deployment_presets SET description = ? WHERE id = ?').run(description?.trim() ?? null, presetId);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { presetId } = await params;
  db.prepare('DELETE FROM deployment_presets WHERE id = ?').run(presetId);
  return NextResponse.json({ success: true });
}
