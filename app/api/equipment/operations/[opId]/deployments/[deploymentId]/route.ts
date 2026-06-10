import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ opId: string; deploymentId: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { opId, deploymentId } = await params;
  db.prepare('DELETE FROM operation_deployments WHERE id = ? AND operation_id = ?').run(deploymentId, opId);
  return NextResponse.json({ success: true });
}
