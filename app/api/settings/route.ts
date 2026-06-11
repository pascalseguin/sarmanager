import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth, requireSM, isNextResponse } from '@/lib/auth-server';

const BLOB_KEY = 'app_settings';

// Server-side code reads these individual keys directly from config — keep them mirrored
const SERVER_MIRROR: Record<string, { configKey: string; sensitive: boolean }> = {
  d4hToken:         { configKey: 'd4h_token',          sensitive: true  },
  d4hTeamId:        { configKey: 'd4h_team_id',         sensitive: false },
  twilioAccountSid: { configKey: 'twilio_account_sid',  sensitive: true  },
  twilioAuthToken:  { configKey: 'twilio_auth_token',   sensitive: true  },
  twilioFromNumber: { configKey: 'twilio_from_number',  sensitive: false },
};

function upsert(key: string, value: string, sensitive = false) {
  db.prepare(`
    INSERT INTO config (key, value, is_sensitive, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      is_sensitive = excluded.is_sensitive,
      updated_at = datetime('now')
  `).run(key, value, sensitive ? 1 : 0);
}

// GET — any authenticated user can read settings
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (isNextResponse(auth)) return auth;

  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(BLOB_KEY) as any;
  if (!row?.value) return NextResponse.json({ settings: null });
  try {
    return NextResponse.json({ settings: JSON.parse(row.value) });
  } catch {
    return NextResponse.json({ settings: null });
  }
}

// POST — SM / admin only
export async function POST(req: NextRequest) {
  const auth = requireSM(req);
  if (isNextResponse(auth)) return auth;

  const body = await req.json();
  const { settings } = body as { settings: Record<string, unknown> };
  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ error: 'settings object required' }, { status: 400 });
  }

  // Write full blob
  upsert(BLOB_KEY, JSON.stringify(settings));

  // Mirror individual keys so server-side routes keep working
  for (const [field, { configKey, sensitive }] of Object.entries(SERVER_MIRROR)) {
    if (settings[field] !== undefined) {
      upsert(configKey, String(settings[field] ?? ''), sensitive);
    }
  }

  return NextResponse.json({ success: true });
}
