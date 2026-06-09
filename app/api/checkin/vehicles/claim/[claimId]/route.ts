import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  db.prepare("DELETE FROM vehicle_claims WHERE id = ?").run(claimId);
  return NextResponse.json({ success: true });
}
