import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

// POST /api/equipment/bulk  { action, ids, ...params }
export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const body = await req.json();
    const { action, ids } = body;
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
    const ph = ids.map(() => '?').join(',');

    if (action === 'delete') {
      const { changes } = db.prepare(`DELETE FROM equipment WHERE id IN (${ph})`).run(...ids);
      return NextResponse.json({ deleted: changes });
    }
    if (action === 'status') {
      const { status } = body;
      if (!['available','deployed','retired'].includes(status))
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      db.prepare(`UPDATE equipment SET status = ?, updated_at = datetime('now') WHERE id IN (${ph})`).run(status, ...ids);
      return NextResponse.json({ updated: ids.length });
    }
    if (action === 'deployable') {
      const { deployable } = body;
      db.prepare(`UPDATE equipment SET deployable = ?, updated_at = datetime('now') WHERE id IN (${ph})`).run(deployable ? 1 : 0, ...ids);
      return NextResponse.json({ updated: ids.length });
    }
    if (action === 'container') {
      const { container } = body;
      db.prepare(`UPDATE equipment SET container = ?, updated_at = datetime('now') WHERE id IN (${ph})`).run(container ?? null, ...ids);
      return NextResponse.json({ updated: ids.length });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
