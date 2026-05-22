import fs from 'fs';
import path from 'path';

// C:\ProgramData\SAR Manager\sarmanager.log — writable by SYSTEM and any logged-in user
const logDir = process.env.ProgramData
  ? path.join(process.env.ProgramData, 'SAR Manager')
  : path.join(process.cwd(), 'logs');

export const LOG_FILE = path.join(logDir, 'sarmanager.log');
const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB

function ensureDir() {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* exists */ }
}

function maybeRotate() {
  try {
    if (fs.statSync(LOG_FILE).size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch { /* file not created yet */ }
}

function write(level: string, route: string, msg: string) {
  ensureDir();
  maybeRotate();
  const line = `[${new Date().toISOString()}] [${level}] [${route}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch { /* fs unavailable */ }
}

export function logInfo(route: string, msg: string) {
  write('INFO', route, msg);
}

export function logError(route: string, msg: string, err?: unknown) {
  const detail = err instanceof Error
    ? err.message + (err.stack ? '\n  ' + err.stack.split('\n').slice(1, 4).join('\n  ') : '')
    : String(err ?? '');
  write('ERROR', route, detail ? `${msg} — ${detail}` : msg);
}
