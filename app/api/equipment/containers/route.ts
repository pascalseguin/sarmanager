import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const tree = req.nextUrl.searchParams.get('tree') === '1';
  if (tree) {
    const rows = db.prepare(`
      SELECT container, COALESCE(TRIM(location),'') AS sub_location, COUNT(*) AS count
      FROM equipment
      WHERE container IS NOT NULL AND container != ''
      GROUP BY container, COALESCE(TRIM(location),'')
      ORDER BY LOWER(container), LOWER(COALESCE(TRIM(location),''))
    `).all() as { container: string; sub_location: string; count: number }[];
    const map = new Map<string, { name: string; count: number; subLocations: { name: string; count: number }[] }>();
    for (const row of rows) {
      if (!map.has(row.container)) map.set(row.container, { name: row.container, count: 0, subLocations: [] });
      const e = map.get(row.container)!;
      e.count += row.count;
      if (row.sub_location) e.subLocations.push({ name: row.sub_location, count: row.count });
    }
    return NextResponse.json({ containers: [...map.values()] });
  }
  const rows = db.prepare(`
    SELECT DISTINCT container FROM equipment
    WHERE container IS NOT NULL AND container != ''
    ORDER BY LOWER(container)
  `).all() as { container: string }[];
  return NextResponse.json({ containers: rows.map(r => r.container) });
}
