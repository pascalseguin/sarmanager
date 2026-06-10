import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { presetId } = await params;
  const { container } = await req.json();
  if (!container?.trim()) return NextResponse.json({ error: 'container required' }, { status: 400 });
  db.prepare('INSERT OR IGNORE INTO deployment_preset_containers (preset_id, container_name) VALUES (?,?)').run(presetId, container.trim());
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { presetId } = await params;
  const { container } = await req.json();
  db.prepare('DELETE FROM deployment_preset_containers WHERE preset_id = ? AND container_name = ?').run(presetId, container);
  return NextResponse.json({ success: true });
}
