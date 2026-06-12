/**
 * app/api/settings/route.ts — Application settings storage
 *
 * ENDPOINTS:
 *   GET  /api/settings  — Read settings blob (any authenticated user)
 *   POST /api/settings  — Write settings blob (SM/admin only)
 *
 * STORAGE MODEL:
 *   Settings are stored in the `config` table in two forms:
 *     1. A JSON blob under key `app_settings` — holds the full settings object
 *        as the client sees it.
 *     2. Individual mirrored keys (e.g., `d4h_token`, `twilio_auth_token`) — so
 *        server-side routes like /api/d4h and /api/twilio can read credentials
 *        without parsing the blob every time.
 *
 * SECURITY:
 *   - Sensitive keys (D4H token, Twilio auth token) are flagged `is_sensitive=1`
 *     in the config table.  This flag is reserved for future use (e.g., encrypting
 *     sensitive values at rest or masking them in the GET response).
 *   - The GET endpoint returns settings to any authenticated user — this is
 *     intentional so that non-SM roles (e.g., future "viewer" role) can read
 *     display settings.  If sensitive fields need to be hidden from non-SMs,
 *     filter by is_sensitive in the GET handler.
 *   - POST is restricted to SM/admin because settings include external API tokens.
 *
 * IMPORTANT: Sensitive credentials (D4H token, Twilio creds) must NEVER be
 * committed to the git repository.  They are stored only in the SQLite DB file
 * (which lives in %APPDATA% and is excluded from version control).
 *
 * OWASP A02:2021 — Cryptographic Failures: credentials stored in DB, not in code.
 * OWASP A01:2021 — Broken Access Control: write requires SM role.
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireAuth, requireSM, isNextResponse } from '@/lib/auth-server';

/** Config table key for the full settings blob. */
const BLOB_KEY = 'app_settings';

/**
 * Map of settings fields → their individual config table keys.
 * When settings are saved, each of these is also written as an individual
 * config row so that server-side routes can read them with a single DB query
 * instead of parsing the entire blob.
 *
 * sensitive: true → the value is an API token or credential.  The flag is
 * stored in the config.is_sensitive column for future encryption/masking.
 */
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
