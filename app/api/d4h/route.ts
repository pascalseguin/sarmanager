import { NextRequest, NextResponse } from 'next/server';
import { logInfo, logError } from '@/lib/server-log';
import db from '@/lib/db';

const D4H_BASE = 'https://api.team-manager.ca.d4h.com';

async function d4hFetch(token: string, path: string, method = 'GET', body?: object) {
  const url = `${D4H_BASE}${path}`;
  logInfo('d4h', `${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.title ?? data?.message ?? data?.error ?? `HTTP ${res.status}`;
    logError('d4h', `${method} ${url} failed`, new Error(`${res.status} — ${msg} — body: ${JSON.stringify(data).slice(0, 400)}`));
    throw new Error(msg);
  }
  logInfo('d4h', `${method} ${url} → ${res.status}`);
  return data;
}

// Cache team ID per token+override so whoami is called at most once per session
const teamIdCache = new Map<string, number>();

async function getTeamId(token: string, teamIdOverride?: number): Promise<number> {
  if (teamIdOverride) return teamIdOverride;
  if (teamIdCache.has(token)) return teamIdCache.get(token)!;

  const data = await d4hFetch(token, '/v3/whoami');
  let teamId: number | undefined;
  const members: Array<{ owner?: { id?: number; resourceType?: string } }> = data?.members ?? [];
  const teamMember = members.find(m => m?.owner?.resourceType === 'Team');
  if (teamMember?.owner?.id) teamId = teamMember.owner.id;
  if (!teamId) {
    const contexts: Array<{ context: string; contextId: number }> = data?.data ?? [];
    const teamCtx = Array.isArray(contexts) ? contexts.find(c => c.context === 'team') : null;
    if (teamCtx?.contextId) teamId = teamCtx.contextId;
  }
  if (!teamId) throw new Error(`Cannot find team ID — /v3/whoami returned: ${JSON.stringify(data).slice(0, 200)}`);
  teamIdCache.set(token, teamId);
  logInfo('d4h', `Resolved teamId=${teamId}`);
  return teamId;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  let token: string = (body.token ?? '').trim();

  // Fall back to DB-stored token if client didn't provide it (settings may not be loaded yet)
  if (!token) {
    try {
      const row = db.prepare("SELECT value FROM config WHERE key = 'd4h_token'").get() as any;
      token = row?.value?.trim() ?? '';
    } catch { /* ignore */ }
  }

  if (!token) {
    logError('d4h', `action=${action} called with no token`);
    return NextResponse.json({ error: 'Missing D4H token — configure it at /settings' }, { status: 400 });
  }

  let teamIdOverride: number | undefined = body.teamId ? Number(body.teamId) : undefined;
  // Fall back to DB-stored team ID if not provided
  if (!teamIdOverride) {
    try {
      const row = db.prepare("SELECT value FROM config WHERE key = 'd4h_team_id'").get() as any;
      const tid = row?.value?.trim();
      if (tid) teamIdOverride = Number(tid) || undefined;
    } catch { /* ignore */ }
  }
  logInfo('d4h', `action=${action}${teamIdOverride ? ` teamId=${teamIdOverride}` : ''}`);
  try {

    // ── List all teams the token has access to ────────────────────────────────
    if (action === 'getTeams') {
      const data = await d4hFetch(token, '/v3/whoami');
      const members: Array<{ owner?: { id?: number; name?: string; resourceType?: string } }> = data?.members ?? [];
      const rawTeams = members
        .filter(m => m?.owner?.resourceType === 'Team')
        .map(m => ({ id: m.owner!.id!, name: m.owner!.name as string | undefined }));

      // For teams where /v3/whoami returned no name, fetch it directly
      const teams = await Promise.all(rawTeams.map(async (t) => {
        if (t.name) return { id: t.id, name: t.name, logo: null as string | null };
        try {
          const td = await d4hFetch(token, `/v3/team/${t.id}`);
          const name: string = td?.data?.title ?? td?.title ?? td?.data?.name ?? td?.name ?? `Team ${t.id}`;
          const logo: string | null = td?.data?.logo ?? td?.data?.logo_url ?? td?.data?.imageUrl ?? td?.logo ?? null;
          return { id: t.id, name, logo };
        } catch {
          return { id: t.id, name: `Team ${t.id}`, logo: null };
        }
      }));

      return NextResponse.json({ teams });
    }

    // ── Get a single team's name (fallback for NavBar when getTeams finds no match) ──
    if (action === 'getTeamInfo') {
      const reqTeamId = body.teamId;
      if (!reqTeamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });
      // Try whoami first — look for this specific team
      const whoami = await d4hFetch(token, '/v3/whoami').catch(() => null);
      if (whoami) {
        const members: Array<{ owner?: { id?: number; name?: string; resourceType?: string } }> = whoami?.members ?? [];
        const match = members.find(m => String(m?.owner?.id) === String(reqTeamId) && m?.owner?.resourceType === 'Team');
        if (match?.owner?.name) return NextResponse.json({ name: match.owner.name });
        // Also try without resourceType filter in case it differs
        const anyMatch = members.find(m => String(m?.owner?.id) === String(reqTeamId));
        if (anyMatch?.owner?.name) return NextResponse.json({ name: anyMatch.owner.name });
      }
      // Fallback: try direct team endpoint
      const teamData = await d4hFetch(token, `/v3/team/${reqTeamId}`).catch(() => null);
      const name = teamData?.title ?? teamData?.name ?? teamData?.data?.title ?? teamData?.data?.name ?? null;
      return NextResponse.json({ name });
    }

    // ── Test connection ───────────────────────────────────────────────────────
    if (action === 'testConnection') {
      const data = await d4hFetch(token, '/v3/whoami');
      const members: Array<{ owner?: { id?: number; name?: string; resourceType?: string } }> = data?.members ?? [];
      const teamMember = members.find(m => m?.owner?.resourceType === 'Team');
      const teamName = teamMember?.owner?.name ?? 'Unknown team';
      const teamId = await getTeamId(token, teamIdOverride);
      return NextResponse.json({ ok: true, teamName, teamId });
    }

    // ── Create incident ───────────────────────────────────────────────────────
    if (action === 'createIncident') {
      const { title, description, startsAt, endsAt } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      // D4H v3 uses "name" for incidents (not "title")
      const payload: Record<string, unknown> = {
        name: title,
        description,
        startsAt: startsAt ?? new Date().toISOString(),
      };
      if (endsAt) payload.endsAt = endsAt;
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents`, 'POST', payload);
      const incidentId = data?.data?.id ?? data?.id;
      return NextResponse.json({ incidentId, incident: data?.data ?? data });
    }

    // ── Create exercise ───────────────────────────────────────────────────────
    if (action === 'createExercise') {
      const { title, description, startsAt, endsAt } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      // D4H v3 uses "name" for exercises (not "title")
      const payload: Record<string, unknown> = {
        name: title,
        description,
        startsAt: startsAt ?? new Date().toISOString(),
      };
      if (endsAt) payload.endsAt = endsAt;
      const data = await d4hFetch(token, `/v3/team/${teamId}/exercises`, 'POST', payload);
      const exerciseId = data?.data?.id ?? data?.id;
      return NextResponse.json({ exerciseId, exercise: data?.data ?? data });
    }

    // ── Update incident ───────────────────────────────────────────────────────
    if (action === 'updateIncident') {
      const { incidentId, title, description } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const payload: Record<string, unknown> = {};
      if (title !== undefined)       payload.name = title;
      if (description !== undefined) payload.description = description;
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents/${incidentId}`, 'PATCH', payload);
      return NextResponse.json({ incident: data?.data ?? data });
    }

    // ── Update exercise ───────────────────────────────────────────────────────
    if (action === 'updateExercise') {
      const { exerciseId, title, description } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const payload: Record<string, unknown> = {};
      if (title !== undefined)       payload.name = title;
      if (description !== undefined) payload.description = description;
      const data = await d4hFetch(token, `/v3/team/${teamId}/exercises/${exerciseId}`, 'PATCH', payload);
      return NextResponse.json({ exercise: data?.data ?? data });
    }

    // ── Post to whiteboard ────────────────────────────────────────────────────
    if (action === 'postWhiteboard') {
      const { title, content, pinned } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const text = title ? `${title}\n${content ?? ''}` : (content ?? '');
      const data = await d4hFetch(token, `/v3/team/${teamId}/whiteboard`, 'POST', {
        text,
        important: pinned ?? false,
      });
      return NextResponse.json({ noteId: data?.data?.id ?? data?.id });
    }

    // ── Send callout (D4H duty callout → triggers notifications to team) ────────
    if (action === 'sendCallout') {
      const { incidentId, message } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const payload: Record<string, unknown> = {};
      if (message) payload.message = String(message).slice(0, 150);
      if (incidentId) payload.activityId = Number(incidentId);
      // D4H v3: try duty-callouts (hyphenated) first; some instances use duty/callouts
      let data: any = null;
      try {
        data = await d4hFetch(token, `/v3/team/${teamId}/duty-callouts`, 'POST', payload);
      } catch {
        data = await d4hFetch(token, `/v3/team/${teamId}/duty/callouts`, 'POST', payload);
      }
      return NextResponse.json({ calloutId: data?.data?.id ?? data?.id ?? String(incidentId) });
    }

    // ── Get members ───────────────────────────────────────────────────────────
    if (action === 'getMembers') {
      const teamId = await getTeamId(token, teamIdOverride);

      // Fetch members, custom status labels, and qual assignments in parallel
      // Try member-qualifications; fall back to member-awards (different D4H orgs use different modules)
      const [data, customStatusData, qualsData, awardsData] = await Promise.all([
        d4hFetch(token, `/v3/team/${teamId}/members?size=500`),
        d4hFetch(token, `/v3/team/${teamId}/member-custom-statuses?size=100`).catch(() => ({ results: [] })),
        d4hFetch(token, `/v3/team/${teamId}/member-qualifications?size=500`).catch(() => ({ results: [] })),
        d4hFetch(token, `/v3/team/${teamId}/member-awards?size=500`).catch(() => ({ results: [] })),
      ]);

      const customStatuses: any[] = customStatusData?.results ?? customStatusData?.data ?? [];
      const statusLabelMap = new Map<number, string>(customStatuses.map((s: any) => [s.id, s.title ?? s.label ?? '']));

      // Merge qual assignments from both endpoints — both use same shape
      function extractQualRows(raw: any): any[] {
        return raw?.results ?? raw?.data ?? (Array.isArray(raw) ? raw : []);
      }
      const allQualRows = [...extractQualRows(qualsData), ...extractQualRows(awardsData)];

      const memberQualsMap = new Map<number, string[]>();
      for (const q of allQualRows) {
        const memberId: number = q?.member?.id ?? q?.member_id;
        // Many possible field structures across D4H versions
        const qualTitle: string =
          q?.qualification?.title ?? q?.award?.title ?? q?.title ?? q?.name ??
          q?.qualification?.name ?? q?.award?.name ?? '';
        const status: string = (q?.status ?? 'current').toLowerCase();
        if (memberId && qualTitle && status !== 'expired' && status !== 'revoked' && status !== 'lapsed') {
          const existing = memberQualsMap.get(memberId) ?? [];
          if (!existing.includes(qualTitle)) memberQualsMap.set(memberId, [...existing, qualTitle]);
        }
      }

      const list: any[] = data?.results ?? data?.data ?? (Array.isArray(data) ? data : []);
      const members = list
        .map((m: any) => {
          // Also pull qualifications embedded directly on the member record (some D4H versions)
          const inlineQuals: string[] = [
            ...(Array.isArray(m.qualifications) ? m.qualifications : [])
              .map((q: any) => (typeof q === 'string' ? q : q?.title ?? q?.name ?? '')).filter(Boolean),
            ...(Array.isArray(m.awards) ? m.awards : [])
              .map((a: any) => (typeof a === 'string' ? a : a?.title ?? a?.award?.title ?? a?.name ?? '')).filter(Boolean),
          ];
          const mapQuals = memberQualsMap.get(m.id) ?? [];
          const quals = [...new Set([...mapQuals, ...inlineQuals])];
          return {
            id: m.id,
            name: m.name || [m.givenName ?? m.firstName, m.surname ?? m.lastName].filter(Boolean).join(' ') || 'Unknown',
            status: m.status ?? 'Unknown',
            customStatusId: m.customStatus?.id ?? undefined,
            customStatusTitle: m.customStatus?.id ? (statusLabelMap.get(m.customStatus.id) ?? undefined) : undefined,
            phone: m.mobile?.phone ?? m.mobilePhone ?? m.home?.phone ?? m.homePhone ?? (typeof m.phone === 'string' ? m.phone : undefined),
            group: m.group?.title ?? m.group?.name ?? undefined,
            qualifications: quals,
          };
        })
        .filter((m: any) => m.status === 'OPERATIONAL' || m.status === 'NON_OPERATIONAL');

      return NextResponse.json({ members });
    }

    // ── Get callout responses (attendance for the incident activity) ──────────
    if (action === 'getCalloutResponses') {
      const { calloutId } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const data = await d4hFetch(token, `/v3/team/${teamId}/attendance?activity_id=${calloutId}&size=200`);
      return NextResponse.json({ responses: data?.results ?? data?.data ?? [] });
    }

    // ── Post incident update (appends to whiteboard; no dedicated update endpoint in D4H v3) ──
    if (action === 'postUpdate') {
      const { incidentId, message } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const label = `Update — ${new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}`;
      const text = incidentId ? `[Incident #${incidentId}] ${label}\n${message}` : `${label}\n${message}`;
      const data = await d4hFetch(token, `/v3/team/${teamId}/whiteboard`, 'POST', { text, important: false });
      return NextResponse.json({ updateId: data?.data?.id ?? data?.id });
    }

    // ── Get equipment list ────────────────────────────────────────────────────
    if (action === 'getEquipment') {
      const teamId = await getTeamId(token, teamIdOverride);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment?size=200`);
      const items = data?.results ?? data?.data ?? [];
      return NextResponse.json({ equipment: items });
    }

    // ── Get single equipment item (to read current notes) ─────────────────────
    if (action === 'getEquipmentItem') {
      const { equipmentId } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment/${equipmentId}`);
      return NextResponse.json({ item: data?.data ?? data });
    }

    // ── Log equipment usage ───────────────────────────────────────────────────
    if (action === 'logEquipmentUsage') {
      const { equipmentId, notes, activityId, date } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const payload: Record<string, unknown> = {
        equipmentItemId: Number(equipmentId),
        notes: notes ?? '',
        quantity: 1,
        date: date ?? new Date().toISOString(),
      };
      if (activityId) payload.activityId = Number(activityId);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment-usages`, 'POST', payload);
      return NextResponse.json({ usageId: data?.data?.id ?? data?.id, usage: data?.data ?? data });
    }

    // ── Log inspection result (sets status Operational/Unserviceable on the item) ──
    // This replaces the old PATCH /v3/equipment/items/{id} which does not exist.
    if (action === 'updateEquipmentStatus') {
      const { equipmentId, status, notes } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const d4hStatus = String(status ?? '').toLowerCase().includes('un') ? 'UNSERVICEABLE' : 'OPERATIONAL';
      const payload: Record<string, unknown> = {
        equipmentItemId: Number(equipmentId),
        status: d4hStatus,
        notes: notes ?? '',
        inspectedAt: new Date().toISOString(),
      };
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment-inspection-results`, 'POST', payload);
      return NextResponse.json({ resultId: data?.data?.id ?? data?.id, result: data?.data ?? data });
    }

    // ── Create repair ticket ──────────────────────────────────────────────────
    if (action === 'createRepairTicket') {
      const { equipmentId, title, description } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      const data = await d4hFetch(token, `/v3/team/${teamId}/repairs`, 'POST', {
        equipmentItemId: Number(equipmentId),
        title: title ?? 'Failed Inspection',
        description: description ?? 'Item flagged as unserviceable.',
        status: 'Awaiting Repair',
        dateOpened: new Date().toISOString(),
      });
      return NextResponse.json({ repairId: data?.data?.id ?? data?.id, repair: data?.data ?? data });
    }

    // ── Get current on-call members ───────────────────────────────────────────
    if (action === 'getOnCall') {
      const teamId = await getTeamId(token, teamIdOverride);
      try {
        // Try the duty-roster endpoint; fall back to duty/shifts if not found
        let data: any = null;
        try {
          data = await d4hFetch(token, `/v3/team/${teamId}/duty-roster?size=50`);
        } catch {
          data = await d4hFetch(token, `/v3/team/${teamId}/duty/roster?size=50`);
        }
        const entries: any[] = data?.results ?? data?.data ?? [];
        return NextResponse.json({
          onCall: entries.map((e: any) => ({
            memberId: e.member?.id ?? e.memberId ?? e.member_id ?? e.id,
            name: e.member?.name ?? e.name,
            endsAt: e.endsAt ?? e.end_at ?? e.ends_at ?? null,
          })),
        });
      } catch { return NextResponse.json({ onCall: [] }); }
    }

    // ── Record attendance for a member on an activity ─────────────────────────
    if (action === 'recordAttendance') {
      const { memberId, activityId } = body;
      const teamId = await getTeamId(token, teamIdOverride);
      try {
        const data = await d4hFetch(token, `/v3/team/${teamId}/attendance`, 'POST', {
          memberId: Number(memberId),
          activityId: Number(activityId),
          status: 'Attending',
        });
        return NextResponse.json({ attendanceId: data?.data?.id ?? data?.id ?? null });
      } catch { return NextResponse.json({ attendanceId: null }); }
    }

    logError('d4h', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('d4h', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
