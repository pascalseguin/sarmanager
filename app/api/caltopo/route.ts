import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logInfo, logError } from '@/lib/server-log';

function sign(secret: string, method: string, url: string, expires: number, payload: string): string {
  const message = `${method} ${url}\n${expires}\n${payload}`;
  const key = Buffer.from(secret, 'base64');
  return crypto.createHmac('sha256', key).update(message).digest('base64');
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

    logError('caltopo', `Unknown action: ${action}`);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    logError('caltopo', `action=${action} threw`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
