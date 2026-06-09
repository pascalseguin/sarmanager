import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ opId: string }> }) {
  const { opId } = await params;
  const op = db.prepare("SELECT id, name, status, deploy_timestamp FROM operations WHERE id = ?").get(opId) as any;
  if (!op) return NextResponse.json({ active: false, operationName: '' });
  return NextResponse.json({
    active: op.status === 'active',
    operationName: op.name,
    deployTimestamp: op.deploy_timestamp ?? null,
  });
}
