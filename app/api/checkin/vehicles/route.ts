import { NextRequest, NextResponse } from 'next/server';
import db, { randomUUID } from '@/lib/db';

const VEHICLE_FILTER = `(UPPER(type) LIKE '%VEHICLE%' OR UPPER(type) LIKE '%TRUCK%' OR UPPER(type) LIKE '%VAN%' OR UPPER(type) LIKE '%UTV%' OR UPPER(type) LIKE '%ATV%' OR UPPER(category) LIKE '%VEHICLE%')`;

// GET /api/checkin/vehicles?operationId=
export async function GET(req: NextRequest) {
  const operationId = req.nextUrl.searchParams.get('operationId');
  if (!operationId) return NextResponse.json({ error: 'operationId required' }, { status: 400 });

  const claims = db.prepare("SELECT * FROM vehicle_claims WHERE operation_id = ? ORDER BY claimed_at").all(operationId) as any[];

  const vehicleMap = new Map<string, { id: string; name: string; driver?: string; passengers: string[] }>();
  for (const c of claims) {
    if (!vehicleMap.has(c.vehicle_id)) vehicleMap.set(c.vehicle_id, { id: c.vehicle_id, name: c.vehicle_name, passengers: [] });
    const v = vehicleMap.get(c.vehicle_id)!;
    if (c.role === 'driver') v.driver = c.searcher_name;
    else v.passengers.push(c.searcher_name);
  }

  // Derive allowed vehicles from the operation's deployed preset containers
  const containerEntries = db.prepare(`
    SELECT DISTINCT dpc.container_name
    FROM operation_deployments od
    JOIN deployment_preset_containers dpc ON od.preset_id = dpc.preset_id
    WHERE od.operation_id = ?
  `).all(operationId) as { container_name: string }[];

  let localVehicles: any[];

  if (containerEntries.length === 0) {
    // No presets deployed — show all non-retired vehicles
    localVehicles = db.prepare(
      `SELECT id, name, ref, location FROM equipment WHERE status != 'retired' AND ${VEHICLE_FILTER} ORDER BY LOWER(name)`
    ).all();
  } else {
    // Build WHERE clause from container entries (same logic as available-equipment route)
    const wholeContainers: string[] = [];
    const subLocPairs: { container: string; loc: string }[] = [];
    for (const { container_name } of containerEntries) {
      const sep = container_name.indexOf(' / ');
      if (sep >= 0) subLocPairs.push({ container: container_name.slice(0, sep), loc: container_name.slice(sep + 3) });
      else wholeContainers.push(container_name);
    }

    const all: any[] = [];
    if (wholeContainers.length) {
      const ph = wholeContainers.map(() => '?').join(',');
      all.push(...db.prepare(
        `SELECT id, name, ref, location FROM equipment WHERE status != 'retired' AND ${VEHICLE_FILTER} AND container IN (${ph}) ORDER BY LOWER(name)`
      ).all(...wholeContainers));
    }
    for (const { container, loc } of subLocPairs) {
      all.push(...db.prepare(
        `SELECT id, name, ref, location FROM equipment WHERE status != 'retired' AND ${VEHICLE_FILTER} AND container = ? AND TRIM(COALESCE(location,'')) = ? ORDER BY LOWER(name)`
      ).all(container, loc));
    }

    const seen = new Set<string>();
    localVehicles = all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  }

  for (const v of localVehicles) {
    if (!vehicleMap.has(v.id)) {
      vehicleMap.set(v.id, { id: v.id, name: v.ref ? `${v.name} (${v.ref})` : v.name, passengers: [] });
    }
  }

  return NextResponse.json({ vehicles: [...vehicleMap.values()] });
}

// POST /api/checkin/vehicles — claim-driver or claim-passenger
export async function POST(req: NextRequest) {
  try {
    const { action, operationId, vehicleId, vehicleName, personnelId, d4hMemberId, searcherName } = await req.json();
    if (!operationId || !vehicleId || !searcherName) {
      return NextResponse.json({ error: 'operationId, vehicleId, and searcherName are required.' }, { status: 400 });
    }

    if (action === 'claim-driver') {
      const existing = db.prepare("SELECT id FROM vehicle_claims WHERE operation_id=? AND vehicle_id=? AND role='driver'").get(operationId, vehicleId);
      if (existing) return NextResponse.json({ error: 'This vehicle already has a driver assigned.' }, { status: 409 });
      const id = randomUUID();
      db.prepare("INSERT INTO vehicle_claims (id, operation_id, vehicle_id, vehicle_name, role, personnel_id, d4h_member_id, searcher_name) VALUES (?,?,?,?,'driver',?,?,?)")
        .run(id, operationId, vehicleId, vehicleName, personnelId ?? null, d4hMemberId ?? null, searcherName);
      return NextResponse.json({ success: true, claimId: id });
    }

    if (action === 'claim-passenger') {
      const passengers = db.prepare("SELECT id FROM vehicle_claims WHERE operation_id=? AND vehicle_id=? AND role='passenger'").all(operationId, vehicleId);
      if (passengers.length >= 4) return NextResponse.json({ error: 'This vehicle is full (max 4 passengers).' }, { status: 409 });
      const id = randomUUID();
      db.prepare("INSERT INTO vehicle_claims (id, operation_id, vehicle_id, vehicle_name, role, personnel_id, d4h_member_id, searcher_name) VALUES (?,?,?,?,'passenger',?,?,?)")
        .run(id, operationId, vehicleId, vehicleName, personnelId ?? null, d4hMemberId ?? null, searcherName);
      return NextResponse.json({ success: true, claimId: id });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
