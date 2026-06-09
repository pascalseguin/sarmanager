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
  // CalTopo signs only the path portion of the URL, not the full URL with domain
  const urlPath = new URL(url).pathname;
  const signature = sign(secret, 'POST', urlPath, expires, json);

  const body = new URLSearchParams({ json, id: credentialId, expires: String(expires), signature });

  logInfo('caltopo', `POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    const text = await res.text();
    logError('caltopo', `POST ${url} failed`, new Error(`${res.status}: ${text.slice(0, 300)}`));
    throw new Error(`CalTopo ${res.status}: ${text.slice(0, 200)}`);
  }

  logInfo('caltopo', `POST ${url} → ${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, credentialId, secret, accountId } = body;

  if (!credentialId || !secret || !accountId) {
    logError('caltopo', `action=${action} called with missing credentials (credentialId=${!!credentialId} secret=${!!secret} accountId=${!!accountId})`);
    return NextResponse.json({ error: 'Missing CalTopo credentials — configure them at /settings' }, { status: 400 });
  }

  logInfo('caltopo', `action=${action} accountId=${accountId}`);
  try {
    if (action === 'createMap') {
      const { title, folderId } = body;
      const url = `https://caltopo.com/api/v1/acct/${accountId}/CollaborativeMap`;
      const mapData = {
        properties: {
          title,
          mode: 'sar',
          sharing: 'SECRET',
          ...(folderId ? { folderId } : {}),
        },
        state: { type: 'FeatureCollection', features: [] },
      };

      const data = await caltopoPost(url, credentialId, secret, mapData);
      const mapId = data?.result?.id ?? data?.id;
      return NextResponse.json({ mapId, url: `https://caltopo.com/m/${mapId}` });
    }

    if (action === 'addFeature') {
      const { mapId, feature } = body;
      const type = feature?.geometry?.type === 'Point' ? 'Marker' : 'Shape';
      const url = `https://caltopo.com/api/v1/map/${mapId}/${type}`;
      const data = await caltopoPost(url, credentialId, secret, feature);
      return NextResponse.json(data);
    }

    // ── Discover existing folders by listing team maps ────────────────────────
    if (action === 'discoverFolders') {
      // List all maps the account owns, extract unique folderId values
      const url = `https://caltopo.com/api/v1/acct/${accountId}/CollaborativeMap`;
      const data = await caltopoGet(url, credentialId, secret);
      const maps: any[] = data?.result ?? data?.results ?? [];
      const seen = new Map<string, string>();
      for (const m of maps) {
        const fId = m?.properties?.folderId ?? m?.folderId;
        const title = m?.properties?.folderId ? `Folder ${fId}` : '';
        if (fId && !seen.has(fId)) seen.set(fId, title);
      }
      return NextResponse.json({ folders: [...seen.entries()].map(([id, title]) => ({ id, title: title || id })) });
    }

    // ── Create a new CalTopo UserFolder ──────────────────────────────────────
    if (action === 'createFolder') {
      const { title = 'SAR Operations' } = body;
      const url = `https://caltopo.com/api/v1/acct/${accountId}/UserFolder`;
      const data = await caltopoPost(url, credentialId, secret, {
        properties: { title: String(title).trim() || 'SAR Operations' },
      });
      const folderId = data?.result?.id ?? data?.id;
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
