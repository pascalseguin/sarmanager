import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const D4H_BASE = 'https://api.team-manager.ca.d4h.com';

async function d4hFetch(token: string, path: string) {
  const res = await fetch(`${D4H_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`D4H ${res.status}`);
  return res.json();
}

function getExtraQuals(): string[] {
  const row = db.prepare("SELECT value FROM config WHERE key = 'extra_quals'").get() as any;
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}

function setExtraQuals(list: string[]) {
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('extra_quals', ?)").run(JSON.stringify(list));
}

// GET /api/quals — returns { d4h: string[], extra: string[], all: string[] }
export async function GET() {
  const extra = getExtraQuals();

  // Try to get D4H quals from config cache
  const cacheRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_quals_cache'").get() as any;
  let d4hQuals: string[] = [];
  if (cacheRow?.value) {
    try { d4hQuals = JSON.parse(cacheRow.value); } catch { /* ignore */ }
  }

  const all = [...new Set([...d4hQuals, ...extra])].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ d4h: d4hQuals, extra, all });
}

// POST /api/quals/sync — re-fetch qual schema from D4H and cache it
// POST /api/quals — add a custom qual
// DELETE /api/quals — remove a custom qual
export async function POST(req: NextRequest) {
  const auth = requireSM(req);
  if (isNextResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));

  // Sync D4H quals
  if (body.action === 'sync') {
    const { token, teamId } = body;
    if (!token || !teamId) return NextResponse.json({ error: 'token and teamId required' }, { status: 400 });
    try {
      // Try qualifications endpoint first, then awards as fallback
      const [qualsData, awardsData] = await Promise.all([
        d4hFetch(token, `/v3/team/${teamId}/qualifications?size=500`).catch(() => null),
        d4hFetch(token, `/v3/team/${teamId}/awards?size=500`).catch(() => null),
      ]);

      const names = new Set<string>();
      for (const row of [...(qualsData?.results ?? qualsData?.data ?? []), ...(awardsData?.results ?? awardsData?.data ?? [])]) {
        const name: string = row?.title ?? row?.name ?? '';
        if (name) names.add(name);
      }

      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('d4h_quals_cache', ?)").run(JSON.stringify(sorted));
      db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('d4h_quals_synced_at', ?)").run(new Date().toISOString());

      const extra = getExtraQuals();
      const all = [...new Set([...sorted, ...extra])].sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ d4h: sorted, extra, all, synced: true });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 });
    }
  }

  // Add a custom qual
  const { name } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const extra = getExtraQuals();
  if (!extra.includes(name.trim())) {
    setExtraQuals([...extra, name.trim()]);
  }
  const updated = getExtraQuals();
  const d4hRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_quals_cache'").get() as any;
  const d4h = d4hRow ? JSON.parse(d4hRow.value ?? '[]') : [];
  return NextResponse.json({ extra: updated, d4h, all: [...new Set([...d4h, ...updated])].sort() });
}

export async function DELETE(req: NextRequest) {
  const auth = requireSM(req);
  if (isNextResponse(auth)) return auth;

  const { name } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const extra = getExtraQuals().filter(q => q !== name);
  setExtraQuals(extra);
  const d4hRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_quals_cache'").get() as any;
  const d4h = d4hRow ? JSON.parse(d4hRow.value ?? '[]') : [];
  return NextResponse.json({ extra, d4h, all: [...new Set([...d4h, ...extra])].sort() });
}
