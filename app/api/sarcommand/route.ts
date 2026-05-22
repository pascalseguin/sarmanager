import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { logInfo, logError } from '@/lib/server-log';

const PF86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
const EXE_PATH = `${PF86}\\BCSARA\\SAR Command Assist\\SAR Command Assistant.exe`;

export async function POST() {
  logInfo('sarcommand', `Attempting to launch: ${EXE_PATH}`);

  if (!existsSync(EXE_PATH)) {
    logError('sarcommand', `Executable not found at: ${EXE_PATH}`);
    return NextResponse.json(
      { error: `SAR Command Assist not found at: ${EXE_PATH}` },
      { status: 404 }
    );
  }

  try {
    const proc = spawn(EXE_PATH, [], { detached: true, stdio: 'ignore' });
    proc.unref();
    logInfo('sarcommand', `Launched SAR Command Assist (pid=${proc.pid})`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError('sarcommand', 'spawn failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
