import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logInfo, logError } from '@/lib/server-log';

function sign(secret: string, method: string, url: string, expires: number, payload: string): string {
  const message = `${method} ${url}\n${expires}\n${payload}`;
  const key = Buffer.from(secret, 'base64');
  return crypto.createHmac('sha256', key).update(message).digest('base64');
}

async function caltopoGet(url: string, credentialId: string, secret: string) {
  const expires = Date.now() + 120_000;
  const urlPath = new URL(url).pathname;
  const message = `GET ${urlPath}\n${expires}\n`;
  const key = Buffer.from(secret, 'base64');
  const signature = crypto.createHmac('sha256', key).update(message).digest('base64');
  const separator = url.includes('?') ? '&' : '?';
  const signed = `${url}${separator}id=${encodeURIComponent(credentialId)}&expires=${expires}&signature=${encodeURIComponent(signature)}`;
  logInfo('caltopo', `GET ${url}`);
  const res = await fetch(signed);
  if (!res.ok) {
    const text = await res.text();
    logError('caltopo', `GET ${url} failed`, new Error(`${res.status}: ${text.slice(0, 300)}`));
    throw new Error(`CalTopo ${res.status}: ${text.slice(0, 200)}`);
  }
  logInfo('caltopo', `GET ${url} → ${res.status}`);
  return res.json();
}

async function caltopoPost(url: string, credentialId: string, secret: string, data: object) {
  const expires = Date.now() + 120_000;
  const json = JSON.stringify(data);
  const urlPath = new URL(url).pathname;
  const signature = sign(secret, 'POST', urlPath, expires, json);
  const body = new URLSearchParams({ json, id: credentialId, expires: String(expires), signature });
  logInfo('caltopo', `POST ${url}`);
  const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) {
    const text = await res.text();
    logError('caltopo', `POST ${url} failed`, new Error(`${res.status}: ${text.slice(0, 300)}`));
    throw new Error(`CalTopo ${res.status}: ${text.slice(0, 200)}`);
  }
  logInfo('caltopo', `POST ${url} → ${res.status}`);
  return res.json();
}

// Route a feature to a CalTopo folder (two-step: create then update with folderId).
// CalTopo ignores folderId on initial creation; must POST to feature endpoint after.
async function routeToFolder(
  mapId: string, featureType: 'Marker' | 'Shape',
  featureId: string, folderId: string,
  credentialId: string, secret: string,
) {
  const url = `https://caltopo.com/api/v1/map/${mapId}/${featureType}/${featureId}`;
  await caltopoPost(url, credentialId, secret, {
    id: featureId, type: 'Feature',
    properties: { class: featureType, folderId },
    geometry: null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, credentialId, secret, accountId } = body;

  if (!credentialId || !secret || !accountId) {
    logError('caltopo', `action=${action} called with missing credentials`);
    return NextResponse.json({ error: 'Missing CalTopo credentials — configure them at /settings' }, { status: 400 });
  }

  logInfo('caltopo', `action=${action} accountId=${accountId}`);
  try {

    // ── Create map ────────────────────────────────────────────────────────────
    if (action === 'createMap') {
      const { title, folderId } = body;
      const url = `https://caltopo.com/api/v1/acct/${accountId}/CollaborativeMap`;
      const mapData = {
        properties: {
          title,
          mode: 'sar',
          sharing: 'URL',          // Matches Electron (URL = shared by link)
          ...(folderId ? { folderId } : {}),
        },
        state: { type: 'FeatureCollection', features: [] },
      };
      const data = await caltopoPost(url, credentialId, secret, mapData);
      const mapId = data?.result?.id ?? data?.id;
      return NextResponse.json({ mapId, url: `https://caltopo.com/m/${mapId}` });
    }

    // ── Add a single feature (marker or shape), optionally routing to folder ──
    if (action === 'addFeature') {
      const { mapId, feature, folderId } = body;
      const featureType: 'Marker' | 'Shape' = feature?.geometry?.type === 'Point' ? 'Marker' : 'Shape';
      const url = `https://caltopo.com/api/v1/map/${mapId}/${featureType}`;
      const data = await caltopoPost(url, credentialId, secret, feature);
      // Two-step folder routing (CalTopo ignores folderId on creation)
      const featureId: string | undefined = data?.result?.id ?? data?.id;
      if (folderId && featureId) {
        try {
          await routeToFolder(mapId, featureType, featureId, folderId, credentialId, secret);
        } catch {
          // Non-fatal — feature is created, just not in the right folder
          logError('caltopo', `routeToFolder failed for feature ${featureId}`);
        }
      }
      return NextResponse.json(data);
    }

    // ── Fetch all features for a map (for Leaflet rendering) ─────────────────
    if (action === 'getMapFeatures') {
      const { mapId } = body;
      if (!mapId) return NextResponse.json({ error: 'mapId required' }, { status: 400 });
      const url = `https://caltopo.com/api/v1/map/${mapId}`;
      const data = await caltopoGet(url, credentialId, secret);
      const features: unknown[] = data?.result?.state?.features ?? data?.state?.features ?? data?.features ?? [];
      return NextResponse.json({ features });
    }

    // ── Refresh IPP/LKP/PLS markers (update symbol on existing markers) ───────
    if (action === 'refreshMarkers') {
      const { mapId, ippSymbol = 'cp' } = body;
      if (!mapId) return NextResponse.json({ error: 'mapId required' }, { status: 400 });
      const url = `https://caltopo.com/api/v1/map/${mapId}`;
      const data = await caltopoGet(url, credentialId, secret);
      const allFeatures: any[] = data?.result?.state?.features ?? data?.state?.features ?? data?.features ?? [];
      const ippMarkers = allFeatures.filter((f: any) => {
        const t = String(f.properties?.title ?? '').toUpperCase();
        return (t.includes('IPP') || t.includes('LKP') || t.includes('PLS')) && f.properties?.class === 'Marker';
      });
      const updated: string[] = [];
      const errors: string[] = [];
      for (const m of ippMarkers) {
        try {
          const featureUrl = `https://caltopo.com/api/v1/map/${mapId}/Marker/${m.id}`;
          await caltopoPost(featureUrl, credentialId, secret, {
            id: m.id, type: 'Feature',
            properties: { ...m.properties, class: 'Marker', 'marker-symbol': ippSymbol, 'marker-size': 1 },
            geometry: m.geometry,
          });
          updated.push(m.properties?.title ?? m.id);
        } catch (e: unknown) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      return NextResponse.json({ success: true, updated, errors });
    }

    // ── Set folder visibility ─────────────────────────────────────────────────
    if (action === 'setFolderVisibility') {
      const { mapId, folderId, folderTitle, visible } = body;
      if (!mapId || !folderId) return NextResponse.json({ error: 'mapId and folderId required' }, { status: 400 });
      const url = `https://caltopo.com/api/v1/map/${mapId}/Folder/${folderId}`;
      const data = await caltopoPost(url, credentialId, secret, {
        id: folderId, type: 'Feature',
        properties: { class: 'Folder', title: folderTitle ?? '', visible: !!visible },
        geometry: null,
      });
      return NextResponse.json(data);
    }

    // ── Discover existing folders via account getdata ─────────────────────────
    if (action === 'discoverFolders') {
      const url = `https://caltopo.com/api/v1/acct/${accountId}/since/0`;
      const data = await caltopoGet(url, credentialId, secret);
      const features: any[] = [
        ...(Array.isArray(data?.features) ? data.features : []),
        ...(Array.isArray(data?.accounts) ? data.accounts : []),
      ];
      const folders = features
        .filter((f: any) => f?.properties?.class === 'UserFolder')
        .map((f: any) => ({
          id: String(f.id ?? f.properties?.id ?? '').trim(),
          title: String(f.properties?.title ?? 'Untitled Folder'),
        }))
        .filter(f => f.id && f.id !== 'undefined' && f.id !== 'null');
      return NextResponse.json({ folders });
    }

    // ── Create a new CalTopo UserFolder ───────────────────────────────────────
    if (action === 'createFolder') {
      const { title = 'SAR Operations' } = body;
      const url = `https://caltopo.com/api/v1/acct/${accountId}/UserFolder`;
      const data = await caltopoPost(url, credentialId, secret, {
        properties: {
          class: 'UserFolder',
          title: String(title).trim() || 'SAR Operations',
          folderId: null,
          synced: true,
          accountId,
        },
      });
      const folderId = data?.result?.id ?? data?.result?.properties?.id ?? data?.id;
      if (!folderId) throw new Error('CalTopo did not return a folder ID');
      return NextResponse.json({ folderId, title });
    }

    logError('caltopo', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('caltopo', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
