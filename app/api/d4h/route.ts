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
  const { action, token } = body;

  if (!token) {
    logError('d4h', `action=${action} called with no token`);
    return NextResponse.json({ error: 'Missing D4H token — configure it at /settings' }, { status: 400 });
  }

  logInfo('d4h', `action=${action}`);
  try {

    // ── Create incident ───────────────────────────────────────────────────────
    if (action === 'createIncident') {
      const { title, description, latitude, longitude } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {
        referenceDescription: title,
        description,
        fullTeam: true,
        startsAt: new Date().toISOString(),
      };
      if (latitude != null && longitude != null) {
        payload.location = { latitude, longitude };
      }

      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents`, 'POST', payload);
      const incidentId = data?.data?.id ?? data?.id;
      return NextResponse.json({ incidentId, incident: data?.data ?? data });
    }

    // ── Update incident ───────────────────────────────────────────────────────
    if (action === 'updateIncident') {
      const { incidentId, title, description } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.referenceDescription = title;
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

    // ── Send callout (publish incident → triggers D4H Twilio SMS) ────────────
    if (action === 'sendCallout') {
      const { incidentId } = body;
      const teamId = await getTeamId(token);
      if (!incidentId) throw new Error('incidentId required to publish callout');
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents/${incidentId}/publish`, 'POST', { published: true });
      return NextResponse.json({ calloutId: String(incidentId), data: data?.data ?? data });
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

    logError('d4h', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('d4h', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
