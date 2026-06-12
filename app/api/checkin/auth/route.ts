/**
 * app/api/checkin/auth/route.ts — Searcher identity verification for check-in portal
 *
 * PURPOSE: Identify a field searcher during self-service check-in WITHOUT requiring
 * a pre-issued username and password.  Searchers provide their name + phone number,
 * and the server looks them up in the personnel roster.
 *
 * AUTHENTICATION MODEL:
 *   This endpoint intentionally does NOT require a login session.  The check-in
 *   portal runs on a device passed to searchers (or via an SMS link) and they may
 *   not have app accounts.  The trade-off is:
 *     Risk:       Someone who knows another person's name + last-7-digits of phone
 *                 could check them in falsely.
 *     Mitigation: The SM sees every check-in in real time on the board and can
 *                 revoke fraudulent entries.  This is an accepted operational risk
 *                 for field-accessibility reasons.
 *
 *   See feature backlog: optional per-operation PIN / SMS verification code.
 *
 * SECURITY:
 *   - Phone matching uses the last 7 digits only to accommodate varied formatting.
 *   - Name lookup uses LOWER() for case-insensitive matching (no LIKE, no regex
 *     injection risk — parameterised IN query with developer-generated placeholders).
 *   - Error messages distinguish "name not found" from "phone doesn't match" to
 *     help legitimate searchers self-correct.  This does expose that a name is in
 *     the roster, but the roster is non-sensitive and the check-in device is
 *     physically controlled.
 *
 * OWASP A07:2021 — Identification and Authentication Failures (acknowledged trade-off)
 * OWASP A01:2021 — Broken Access Control: operation-closed check prevents check-in
 *                   after an operation is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * Check whether a D4H member is currently on-call, and return their on-call
 * end time if so.  Used to pre-populate the drop-dead time field on the fitness
 * screen.  Non-fatal: returns null on any error (D4H unavailable, token missing).
 */
async function checkOnCall(d4hMemberId: number): Promise<string | null> {
  try {
    const row     = db.prepare("SELECT value FROM config WHERE key = 'd4h_token'").get() as any;
    const token   = row?.value;
    const teamRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_team_id'").get() as any;
    const teamId  = teamRow?.value;
    if (!token || !teamId) return null;

    // D4H CA API base URL.  /duty-roster returns current on-call schedule entries.
    // Both /duty-roster and /duty/roster are tried for compatibility across D4H regions.
    // Non-fatal: !res.ok returns null rather than logging, because 404 is expected on
    // D4H instances that don't use the duty roster module.
    const CA_BASE = 'https://api.team-manager.ca.d4h.com';
    let data: any = null;
    for (const path of [`/v3/team/${teamId}/duty-roster?size=50`, `/v3/team/${teamId}/duty/roster?size=50`]) {
      const res = await fetch(`${CA_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.ok) { data = await res.json(); break; }
    }
    if (!data) return null;

    const entries: any[] = data?.data ?? data?.results ?? [];
    const entry = entries.find((e: any) => (e.member?.id ?? e.member_id) === d4hMemberId);
    return entry?.end_at ?? entry?.ends_at ?? entry?.endsAt ?? null;
  } catch { return null; }
}

function normalizePhone(raw: string) { return raw.replace(/\D/g, ''); }

function nameVariants(first: string, last: string): string[] {
  const f = first.trim().toLowerCase();
  const l = last.trim().toLowerCase();
  return [`${f} ${l}`, `${l} ${f}`, `${l}, ${f}`, `${f}${l}`, `${l}${f}`];
}

function phoneMatches(input: string, ...candidates: (string | null | undefined)[]): boolean {
  const norm = normalizePhone(input);
  if (norm.length < 7) return false;
  const last7 = norm.slice(-7);
  return candidates.some(c => c && normalizePhone(c).endsWith(last7));
}

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, phone, operationId } = await req.json();
    if (!firstName?.trim() || !lastName?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'First name, last name, and phone are required.' }, { status: 400 });
    }

    if (operationId) {
      const op = db.prepare("SELECT status FROM operations WHERE id = ?").get(operationId) as any;
      if (op && op.status !== 'active') {
        return NextResponse.json({ error: 'This operation has been closed. Check-in is no longer available.' }, { status: 403 });
      }
    }

    const variants = nameVariants(firstName, lastName);
    const placeholders = variants.map(() => '?').join(',');
    const candidates = db.prepare(`
      SELECT p.*, u.qualifications AS user_quals, u.phone AS user_phone
      FROM personnel p LEFT JOIN users u ON p.user_id = u.id
      WHERE LOWER(p.name) IN (${placeholders})
    `).all(...variants) as any[];

    const match = candidates.find(p => phoneMatches(phone, p.phone, p.contact, p.user_phone));

    if (!match) {
      const nameFound = candidates.length > 0;
      return NextResponse.json({
        error: nameFound
          ? `Found ${firstName} ${lastName} in the roster but the phone number doesn't match.`
          : `No roster entry found for ${firstName} ${lastName}. Ask your Search Manager to add you to the roster.`,
      }, { status: 404 });
    }

    const d4hRow = db.prepare("SELECT d4h_member_id FROM d4h_member_map WHERE local_personnel_id = ?").get(match.id) as any;
    const d4hMemberId: number | null = d4hRow?.d4h_member_id ?? null;
    const quals: string[] = (match.qualifications ?? match.user_quals ?? '')
      .split(/[,;]+/).map((q: string) => q.trim()).filter(Boolean);

    const onCallEndsAt = d4hMemberId ? await checkOnCall(d4hMemberId) : null;

    return NextResponse.json({
      personnelId: match.id,
      d4hMemberId,
      name: match.name,
      qualifications: quals,
      contact: match.contact ?? '',
      operationId,
      onCallEndsAt,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
