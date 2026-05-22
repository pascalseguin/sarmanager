import { NextResponse } from 'next/server';
import fs from 'fs';
import { LOG_FILE } from '@/lib/server-log';

export async function GET() {
  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8');
    // Return last 500 lines so the response stays small
    const lines = text.split('\n').filter(Boolean);
    const tail = lines.slice(-500);
    return NextResponse.json({ lines: tail, path: LOG_FILE, total: lines.length });
  } catch (err: unknown) {
    const notFound = err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (notFound) {
      return NextResponse.json({ lines: [], path: LOG_FILE, total: 0, note: 'Log file not yet created — no API calls have been made.' });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    fs.unlinkSync(LOG_FILE);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // already gone
  }
}
