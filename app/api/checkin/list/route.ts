import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const operationId = req.nextUrl.searchParams.get('operationId');
  if (!operationId) return NextResponse.json({ error: 'operationId required' }, { status: 400 });
  const checkins = db.prepare("SELECT * FROM searcher_checkins WHERE operation_id=? ORDER BY checked_in_at").all(operationId);
  const vehicles = db.prepare("SELECT * FROM vehicle_claims WHERE operation_id=? ORDER BY claimed_at").all(operationId);
  return NextResponse.json({ checkins, vehicles });
}
