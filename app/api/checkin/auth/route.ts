import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

async function checkOnCall(d4hMemberId: number): Promise<string | null> {
  try {
    const row = db.prepare("SELECT value FROM config WHERE key = 'd4h_token'").get() as any;
    const token = row?.value;
    const teamRow = db.prepare("SELECT value FROM config WHERE key = 'd4h_team_id'").get() as any;
    const teamId = teamRow?.value;
    if (!token || !teamId) return null;
    const res = await fetch(`https://api.d4h.com/v3/team/${teamId}/duty-roster/on-call`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entries: any[] = data?.data ?? data?.results ?? [];
    const entry = entries.find((e: any) => (e.member?.id ?? e.member_id) === d4hMemberId);
    return entry?.end_at ?? entry?.ends_at ?? null;
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
