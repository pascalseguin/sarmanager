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
  const contexts: Array<{ context: string; contextId: number }> = data?.data ?? [];
  const team = Array.isArray(contexts) ? contexts.find(c => c.context === 'team') : null;
  if (!team?.contextId) {
    throw new Error(`Cannot find team ID — /v3/whoami returned: ${JSON.stringify(data).slice(0, 200)}`);
  }
  teamIdCache.set(token, team.contextId);
  logInfo('d4h', `Resolved teamId=${team.contextId}`);
  return team.contextId;
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
      const payload: Record<string, unknown> = { title, description };
      if (latitude != null) payload.latitude = latitude;
      if (longitude != null) payload.longitude = longitude;

      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents`, 'POST', payload);
      const incidentId = data?.data?.id ?? data?.id;
      return NextResponse.json({ incidentId, incident: data?.data ?? data });
    }

    // ── Update incident ───────────────────────────────────────────────────────
    if (action === 'updateIncident') {
      const { incidentId, title, description } = body;
      const teamId = await getTeamId(token);
      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.title = title;
      if (description !== undefined) payload.description = description;
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents/${incidentId}`, 'PATCH', payload);
      return NextResponse.json({ incident: data?.data ?? data });
    }

    // ── Post to whiteboard ────────────────────────────────────────────────────
    if (action === 'postWhiteboard') {
      const { title, content } = body;
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/whiteboard`, 'POST', {
        title,
        description: content,
      });
      return NextResponse.json({ noteId: data?.data?.id ?? data?.id });
    }

    // ── Send callout ──────────────────────────────────────────────────────────
    if (action === 'sendCallout') {
      const { message, incidentId } = body;
      const teamId = await getTeamId(token);
      const trimmed = message.slice(0, 150);
      const payload: Record<string, unknown> = { message: trimmed };
      if (incidentId) payload.activityId = Number(incidentId);

      const data = await d4hFetch(token, `/v3/team/${teamId}/duty/callouts`, 'POST', payload);
      return NextResponse.json({ calloutId: data?.data?.id ?? data?.id });
    }

    // ── Get members ───────────────────────────────────────────────────────────
    if (action === 'getMembers') {
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/members?limit=500`);
      return NextResponse.json({ members: data?.data ?? data?.results ?? [] });
    }

    // ── Get callout responses ─────────────────────────────────────────────────
    if (action === 'getCalloutResponses') {
      const { calloutId } = body;
      const teamId = await getTeamId(token);
      const data = await d4hFetch(token, `/v3/team/${teamId}/duty/callouts/${calloutId}/responses`);
      return NextResponse.json({ responses: data?.data ?? [] });
    }

    // ── Post incident update / log entry ──────────────────────────────────────
    if (action === 'postUpdate') {
      const { incidentId, message } = body;
      const teamId = await getTeamId(token);
      // Note: if this 404s, D4H v3 may not expose incident log entries via API
      const data = await d4hFetch(token, `/v3/team/${teamId}/incidents/${incidentId}/updates`, 'POST', { message });
      return NextResponse.json({ updateId: data?.data?.id ?? data?.id });
    }

    logError('d4h', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('d4h', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
