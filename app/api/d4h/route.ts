import { NextRequest, NextResponse } from 'next/server';
import { logInfo, logError } from '@/lib/server-log';

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

// Cache team ID per token so each deploy sequence only calls whoami once
const teamIdCache = new Map<string, number>();

async function getTeamId(token: string): Promise<number> {
  if (teamIdCache.has(token)) return teamIdCache.get(token)!;
  const data = await d4hFetch(token, '/v3/whoami');

  // v3 API response: { members: [{ owner: { id, resourceType: "Team" } }] }
  let teamId: number | undefined;
  const members: Array<{ owner?: { id?: number; resourceType?: string } }> = data?.members ?? [];
  const teamMember = members.find(m => m?.owner?.resourceType === 'Team');
  if (teamMember?.owner?.id) {
    teamId = teamMember.owner.id;
  }
  // Fallback: legacy { data: [{ context: 'team', contextId }] }
  if (!teamId) {
    const contexts: Array<{ context: string; contextId: number }> = data?.data ?? [];
    const teamCtx = Array.isArray(contexts) ? contexts.find(c => c.context === 'team') : null;
    if (teamCtx?.contextId) teamId = teamCtx.contextId;
  }

  if (!teamId) {
    throw new Error(`Cannot find team ID — /v3/whoami returned: ${JSON.stringify(data).slice(0, 200)}`);
  }
  teamIdCache.set(token, teamId);
  logInfo('d4h', `Resolved teamId=${teamId}`);
  return teamId;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const token: string = (body.token ?? '').trim();

  if (!token) {
    logError('d4h', `action=${action} called with no token`);
    return NextResponse.json({ error: 'Missing D4H token — configure it at /settings' }, { status: 400 });
  }

  logInfo('d4h', `action=${action}`);
  try {

    // ── Test connection ───────────────────────────────────────────────────────
    if (action === 'testConnection') {
      const data = await d4hFetch(token, '/v3/whoami');
      const members: Array<{ owner?: { id?: number; name?: string; resourceType?: string } }> = data?.members ?? [];
      const teamMember = members.find(m => m?.owner?.resourceType === 'Team');
      const teamName = teamMember?.owner?.name ?? 'Unknown team';
      const teamId = await getTeamId(token);
      return NextResponse.json({ ok: true, teamName, teamId });
    }

    // ── Create incident ───────────────────────────────────────────────────────
    if (action === 'createIncident') {
      const { title, description, startsAt, endsAt } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {
        title,
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
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {
        title,
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
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {};
      if (title !== undefined)       payload.title = title;
      if (description !== undefined) payload.description = description;
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents/${incidentId}`, 'PATCH', payload);
      return NextResponse.json({ incident: data?.data ?? data });
    }

    // ── Post to whiteboard ────────────────────────────────────────────────────
    if (action === 'postWhiteboard') {
      const { title, content, pinned } = body;
      const teamId = await getTeamId(token);
      const text = title ? `${title}\n${content ?? ''}` : (content ?? '');
      const data = await d4hFetch(token, `/v3/team/${teamId}/whiteboard`, 'POST', {
        text,
        important: pinned ?? false,
      });
      return NextResponse.json({ noteId: data?.data?.id ?? data?.id });
    }

    // ── Send callout (D4H duty callout → triggers Twilio SMS to team) ────────
    if (action === 'sendCallout') {
      const { incidentId, message } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {};
      if (message) payload.message = String(message).slice(0, 150);
      if (incidentId) payload.activityId = Number(incidentId);
      const data = await d4hFetch(token, `/v3/team/${teamId}/duty/callouts`, 'POST', payload);
      return NextResponse.json({ calloutId: data?.data?.id ?? data?.id ?? String(incidentId) });
    }

    // ── Get members ───────────────────────────────────────────────────────────
    if (action === 'getMembers') {
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/members?size=500`);
      return NextResponse.json({ members: data?.data ?? data?.results ?? [] });
    }

    // ── Get callout responses (attendance for the incident activity) ──────────
    if (action === 'getCalloutResponses') {
      const { calloutId } = body;
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/attendance?activity_id=${calloutId}&size=200`);
      return NextResponse.json({ responses: data?.data ?? [] });
    }

    // ── Post incident update (appends to whiteboard; no dedicated update endpoint in D4H v3) ──
    if (action === 'postUpdate') {
      const { incidentId, message } = body;
      const teamId = await getTeamId(token);
      const label = `Update — ${new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}`;
      const text = incidentId ? `[Incident #${incidentId}] ${label}\n${message}` : `${label}\n${message}`;
      const data = await d4hFetch(token, `/v3/team/${teamId}/whiteboard`, 'POST', { text, important: false });
      return NextResponse.json({ updateId: data?.data?.id ?? data?.id });
    }

    // ── Get equipment list ────────────────────────────────────────────────────
    if (action === 'getEquipment') {
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment?size=200`);
      const items = data?.data ?? data?.results ?? [];
      return NextResponse.json({ equipment: items });
    }

    // ── Get single equipment item (to read current notes) ─────────────────────
    if (action === 'getEquipmentItem') {
      const { equipmentId } = body;
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment/${equipmentId}`);
      return NextResponse.json({ item: data?.data ?? data });
    }

    // ── Log equipment usage ───────────────────────────────────────────────────
    if (action === 'logEquipmentUsage') {
      const { equipmentId, notes, activityId, date } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {
        equipment_item_id: Number(equipmentId),
        notes: notes ?? '',
        quantity: 1,
        date: date ?? new Date().toISOString(),
      };
      if (activityId) payload.activity_id = Number(activityId);
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment-usages`, 'POST', payload);
      return NextResponse.json({ usageId: data?.data?.id ?? data?.id, usage: data?.data ?? data });
    }

    // ── Log inspection result (sets status Operational/Unserviceable on the item) ──
    // This replaces the old PATCH /v3/equipment/items/{id} which does not exist.
    if (action === 'updateEquipmentStatus') {
      const { equipmentId, status, notes } = body;
      const teamId = await getTeamId(token);
      const d4hStatus = String(status ?? '').toLowerCase().includes('un') ? 'UNSERVICEABLE' : 'OPERATIONAL';
      const payload: Record<string, unknown> = {
        equipment_item_id: Number(equipmentId),
        status: d4hStatus,
        notes: notes ?? '',
        inspected_at: new Date().toISOString(),
      };
      const data = await d4hFetch(token, `/v3/team/${teamId}/equipment-inspection-results`, 'POST', payload);
      return NextResponse.json({ resultId: data?.data?.id ?? data?.id, result: data?.data ?? data });
    }

    // ── Create repair ticket ──────────────────────────────────────────────────
    if (action === 'createRepairTicket') {
      const { equipmentId, title, description } = body;
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/repairs`, 'POST', {
        equipment_item_id: Number(equipmentId),
        title: title ?? 'Failed Inspection',
        description: description ?? 'Item flagged as unserviceable.',
        status: 'Awaiting Repair',
        date_opened: new Date().toISOString(),
      });
      return NextResponse.json({ repairId: data?.data?.id ?? data?.id, repair: data?.data ?? data });
    }

    logError('d4h', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('d4h', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
