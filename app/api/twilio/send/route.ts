import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

async function twilioPost(accountSid: string, authToken: string, path: string, body: Record<string, string>) {
  const url = `${TWILIO_BASE}/${accountSid}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Twilio ${res.status}`);
  return data as { sid?: string };
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('1') && digits.length === 11 ? `+${digits}` : `+1${digits.slice(-10)}`;
}

export async function POST(req: NextRequest) {
  const auth = requireSM(req);
  if (isNextResponse(auth)) return auth;

  try {
    const body = await req.json() as {
      action: 'sms' | 'call';
      accountSid: string;
      authToken: string;
      fromNumber: string;
      message: string;
      to?: string[];
    };
    const { action, accountSid, authToken, fromNumber, message, to } = body;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json({ error: 'accountSid, authToken, and fromNumber are required' }, { status: 400 });
    }

    let recipients = to ?? [];
    if (!recipients.length) {
      const rows = db.prepare(
        "SELECT phone FROM personnel WHERE status != 'inactive' AND phone IS NOT NULL AND phone != ''"
      ).all() as { phone: string }[];
      recipients = rows.map(r => r.phone).filter(Boolean);
    }

    if (!recipients.length) {
      return NextResponse.json({ error: 'No recipient phone numbers found in roster' }, { status: 400 });
    }

    const results: { to: string; sid?: string; error?: string }[] = [];

    for (const raw of recipients) {
      const to = normalizePhone(raw);
      if (!to) continue;
      try {
        if (action === 'sms') {
          const data = await twilioPost(accountSid, authToken, '/Messages.json', {
            To: to, From: fromNumber, Body: message,
          });
          results.push({ to, sid: data.sid });
        } else if (action === 'call') {
          const twiml = `<Response><Say rate="slow">${message}</Say><Pause length="2"/><Say rate="slow">${message}</Say></Response>`;
          const data = await twilioPost(accountSid, authToken, '/Calls.json', {
            To: to, From: fromNumber, Twiml: twiml,
          });
          results.push({ to, sid: data.sid });
        }
      } catch (e: unknown) {
        results.push({ to, error: e instanceof Error ? e.message : 'Failed' });
      }
    }

    const sent = results.filter(r => r.sid).length;
    const failed = results.filter(r => r.error).length;
    return NextResponse.json({ sent, failed, total: results.length, results });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
