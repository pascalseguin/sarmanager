import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM events WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  db.prepare("DELETE FROM events WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
