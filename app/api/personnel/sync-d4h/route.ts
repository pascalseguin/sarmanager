import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const D4H_BASE = 'https://api.team-manager.ca.d4h.com';

async function d4hFetch(token: string, path: string) {
  const res = await fetch(`${D4H_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return res.json().catch(() => ({}));
}

// POST /api/personnel/sync-d4h
// Body: { token, teamId }
// Re-fetches D4H member qualifications and updates all linked local personnel
export async function POST(req: NextRequest) {
  const auth = requireSM(req);
  if (isNextResponse(auth)) return auth;

  try {
    const { token, teamId } = await req.json();
    if (!token) return NextResponse.json({ error: 'D4H token required' }, { status: 400 });
    if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });

    const teamIdNum = Number(teamId);

    // Fetch members + both qual endpoints in parallel
    const [membersData, qualsData, awardsData] = await Promise.all([
      d4hFetch(token, `/v3/team/${teamIdNum}/members?size=500&status=OPERATIONAL,NON_OPERATIONAL`),
      d4hFetch(token, `/v3/team/${teamIdNum}/member-qualifications?size=500`).catch(() => ({ results: [] })),
      d4hFetch(token, `/v3/team/${teamIdNum}/member-awards?size=500`).catch(() => ({ results: [] })),
    ]);

    function extractRows(raw: any): any[] {
      return raw?.results ?? raw?.data ?? (Array.isArray(raw) ? raw : []);
    }

    // Build qualifications map from both endpoints + inline member fields
    const memberQualsMap = new Map<number, string[]>();
    for (const q of [...extractRows(qualsData), ...extractRows(awardsData)]) {
      const memberId: number = q?.member?.id ?? q?.member_id;
      const qualTitle: string =
        q?.qualification?.title ?? q?.award?.title ?? q?.title ?? q?.name ??
        q?.qualification?.name ?? q?.award?.name ?? '';
      const status: string = (q?.status ?? 'current').toLowerCase();
      if (memberId && qualTitle && status !== 'expired' && status !== 'revoked' && status !== 'lapsed') {
        const existing = memberQualsMap.get(memberId) ?? [];
        if (!existing.includes(qualTitle)) memberQualsMap.set(memberId, [...existing, qualTitle]);
      }
    }

    // Also pull inline quals from the member record itself
    for (const m of extractRows(membersData)) {
      const inlineQuals: string[] = [
        ...(Array.isArray(m.qualifications) ? m.qualifications : [])
          .map((q: any) => (typeof q === 'string' ? q : q?.title ?? q?.name ?? '')).filter(Boolean),
        ...(Array.isArray(m.awards) ? m.awards : [])
          .map((a: any) => (typeof a === 'string' ? a : a?.title ?? a?.award?.title ?? a?.name ?? '')).filter(Boolean),
      ];
      if (inlineQuals.length > 0) {
        const existing = memberQualsMap.get(m.id) ?? [];
        memberQualsMap.set(m.id, [...new Set([...existing, ...inlineQuals])]);
      }
    }

    // Also capture member status + phone changes
    const membersList: any[] = membersData?.results ?? membersData?.data ?? (Array.isArray(membersData) ? membersData : []);
    const memberStatusMap = new Map<number, string>();
    const memberPhoneMap = new Map<number, string>();
    for (const m of membersList) {
      const memberStatus = m.status === 'OPERATIONAL' ? 'Operational' : 'Member In Training';
      memberStatusMap.set(m.id, memberStatus);
      const phone: string | undefined =
        m.mobile?.phone ?? m.mobilePhone ?? m.home?.phone ?? m.homePhone ??
        (typeof m.phone === 'string' ? m.phone : undefined);
      if (phone) memberPhoneMap.set(m.id, phone);
    }

    // Get all d4h_member_map entries with a local link
    const maps = db.prepare(
      'SELECT d4h_member_id, local_personnel_id FROM d4h_member_map WHERE local_personnel_id IS NOT NULL'
    ).all() as { d4h_member_id: number; local_personnel_id: string }[];

    let updated = 0;
    let skipped = 0;
    let qualsWritten = 0;
    let phonesWritten = 0;

    for (const map of maps) {
      const quals = memberQualsMap.get(map.d4h_member_id);
      const newStatus = memberStatusMap.get(map.d4h_member_id);
      const newPhone = memberPhoneMap.get(map.d4h_member_id);

      if (!quals && !newStatus && !newPhone) { skipped++; continue; }

      const fields: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];

      if (quals && quals.length > 0) {
        fields.push('qualifications = ?');
        vals.push(quals.join(', '));
        qualsWritten++;
      }
      if (newStatus) {
        fields.push('member_status = ?');
        vals.push(newStatus);
      }
      if (newPhone) {
        fields.push('phone = CASE WHEN (phone IS NULL OR phone = \'\') THEN ? ELSE phone END');
        vals.push(newPhone);
        phonesWritten++;
      }

      vals.push(map.local_personnel_id);
      db.prepare(`UPDATE personnel SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      updated++;
    }

    return NextResponse.json({ updated, skipped, total: maps.length, qualsWritten, phonesWritten });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 });
  }
}
