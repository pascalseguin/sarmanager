/**
 * lib/db.ts — SQLite database initialisation, schema, and migrations
 *
 * PURPOSE: Single entry point for the database connection.  All API routes
 * `import db from '@/lib/db'` and get the same singleton instance.
 *
 * ARCHITECTURE:
 *   - better-sqlite3 is used (synchronous SQLite bindings) because Next.js API
 *     routes run in a Node.js single-thread context.  Synchronous DB access
 *     simplifies error handling and avoids callback hell.
 *   - The DB file lives in the user's AppData directory so it survives app updates
 *     and is not bundled with the installer.
 *
 * MIGRATIONS (runtime ALTER TABLE):
 *   Schema changes for existing installs are handled via the `migrations` array at
 *   the bottom of the file.  Each statement is wrapped in try/catch so it is a
 *   no-op when the column already exists.  Never remove an old migration entry —
 *   adding duplicates is safe; removing them is not.
 *
 * SECURITY:
 *   - WAL journal mode: improves concurrency and reduces the chance of corruption
 *     if the process is killed mid-write.
 *   - foreign_keys = ON: enforces referential integrity at the SQLite level.
 *   - All DML uses parameterised queries (db.prepare().run(param, ...)).  The schema
 *     DDL here is developer-controlled (not user-supplied) so exec() is safe.
 *
 * OWASP A03:2021 — Injection: parameterised queries prevent SQL injection.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// ── Data directory ─────────────────────────────────────────────────────────────
// On Windows: %APPDATA%\SAR Manager\data
// On macOS/Linux: ~/.local/share/SAR Manager/data
// Override with the DB_PATH env-var for testing (e.g., DB_PATH=':memory:').
const DATA_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(
      process.env.APPDATA ?? path.join(os.homedir(), '.local', 'share'),
      'SAR Manager',
      'data',
    );

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = process.env.DB_PATH || path.join(DATA_DIR, 'sar-manager.db');

const db = new Database(DB_FILE);

// WAL (Write-Ahead Logging) mode:
//   - Readers don't block writers and vice-versa.
//   - Greatly reduces the chance of SQLITE_BUSY errors when the board polls every 15s
//     while the user is saving data.
db.pragma('journal_mode = WAL');

// Enforce foreign key constraints — SQLite ignores FK violations by default.
// This catches referential integrity bugs during development.
db.pragma('foreign_keys = ON');

// ── Core tables ───────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'sm',
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    qualifications TEXT,
    phone TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    operation_type TEXT DEFAULT 'search',
    created_by TEXT REFERENCES users(id),
    priority INTEGER DEFAULT 1,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    -- Subject
    lost_person_name TEXT,
    lost_person_age INTEGER,
    lost_person_description TEXT,
    subject_category TEXT DEFAULT 'hiker',
    subject_sex TEXT,
    subject_clothing TEXT,
    subject_gear TEXT,
    subject_condition TEXT,
    subject_circumstance TEXT,
    -- Location
    last_seen_location TEXT,
    last_seen_time TEXT,
    latitude REAL,
    longitude REAL,
    lkp_notes TEXT,
    pls_location TEXT,
    pls_lat REAL,
    pls_lon REAL,
    pls_time TEXT,
    reported_time TEXT,
    ipp_type TEXT DEFAULT 'lkp',
    terrain_type TEXT DEFAULT 'forest',
    -- Command
    tasking_agency TEXT,
    oic_name TEXT,
    oic_phone TEXT,
    mutual_aid_orgs TEXT,
    safety_concerns TEXT,
    -- Integrations
    caltopo_map_id TEXT,
    caltopo_map_url TEXT,
    d4h_incident_id TEXT,
    d4h_exercise_id TEXT,
    d4h_activity_type TEXT,
    d4h_callout_id TEXT,
    -- Deploy
    deploy_decision TEXT,
    deploy_timestamp TEXT,
    weather_snapshot TEXT,
    sync_version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS personnel (
    id TEXT PRIMARY KEY,
    operation_id TEXT REFERENCES operations(id) ON DELETE SET NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    status TEXT DEFAULT 'available',
    qualifications TEXT,
    contact TEXT,
    phone TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    sync_version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'log',
    title TEXT NOT NULL,
    description TEXT,
    created_by TEXT REFERENCES users(id),
    latitude REAL,
    longitude REAL,
    location_description TEXT,
    severity TEXT DEFAULT 'info',
    created_at TEXT DEFAULT (datetime('now')),
    sync_version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    task_number TEXT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'assignment_prepared',
    task_type TEXT,
    description TEXT,
    caltopo_folder_id TEXT,
    created_by TEXT REFERENCES users(id),
    started_at TEXT,
    completed_at TEXT,
    debrief_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_assignments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    is_team_leader INTEGER DEFAULT 0,
    assigned_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS d4h_member_map (
    id TEXT PRIMARY KEY,
    d4h_member_id INTEGER NOT NULL,
    d4h_member_name TEXT NOT NULL,
    d4h_email TEXT,
    d4h_status TEXT,
    d4h_group_name TEXT,
    local_personnel_id TEXT REFERENCES personnel(id) ON DELETE SET NULL,
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS d4h_callouts (
    id TEXT PRIMARY KEY,
    d4h_activity_id INTEGER,
    operation_id TEXT REFERENCES operations(id),
    caltopo_url TEXT,
    message TEXT,
    status TEXT DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now')),
    last_polled TEXT
  );

  CREATE TABLE IF NOT EXISTS d4h_callout_responses (
    id TEXT PRIMARY KEY,
    callout_id TEXT REFERENCES d4h_callouts(id),
    d4h_member_id INTEGER,
    d4h_member_name TEXT,
    attendance_status TEXT,
    mapped_status TEXT,
    local_personnel_id TEXT REFERENCES personnel(id),
    responded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_sensitive INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    d4h_equipment_id INTEGER UNIQUE,
    tag TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    serial TEXT,
    ref TEXT,
    type TEXT,
    category TEXT,
    location TEXT,
    container TEXT,
    status TEXT DEFAULT 'available',
    deployable INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deployment_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    items_json TEXT NOT NULL DEFAULT '[]',
    equipment_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS operation_equipment_logs (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    equipment_id INTEGER,
    preset_id TEXT,
    notes TEXT,
    d4h_activity_id INTEGER,
    logged_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insp_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    fields_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insp_results (
    id TEXT PRIMARY KEY,
    template_id TEXT,
    template_name TEXT NOT NULL,
    equipment_id INTEGER,
    equipment_name TEXT NOT NULL,
    operation_id TEXT REFERENCES operations(id) ON DELETE SET NULL,
    completed_by TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    overall_passed INTEGER NOT NULL DEFAULT 1,
    field_results_json TEXT NOT NULL DEFAULT '[]',
    d4h_synced INTEGER DEFAULT 0,
    d4h_activity_id INTEGER,
    d4h_synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vehicle_claims (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_name TEXT NOT NULL,
    role TEXT NOT NULL,
    personnel_id TEXT,
    d4h_member_id INTEGER,
    searcher_name TEXT NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS searcher_checkins (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    personnel_id TEXT,
    d4h_member_id INTEGER,
    searcher_name TEXT NOT NULL,
    fit_for_field INTEGER NOT NULL DEFAULT 1,
    drop_dead_time TEXT NOT NULL,
    quals_confirmed INTEGER NOT NULL DEFAULT 1,
    quals_note TEXT,
    vehicle_role TEXT,
    vehicle_id TEXT,
    vehicle_name TEXT,
    inspection_submitted INTEGER NOT NULL DEFAULT 0,
    d4h_attendance_id INTEGER,
    checked_in_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Additional tables (equipment full schema) ─────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS deployment_preset_containers (
    preset_id TEXT NOT NULL REFERENCES deployment_presets(id) ON DELETE CASCADE,
    container_name TEXT NOT NULL,
    PRIMARY KEY (preset_id, container_name)
  );

  CREATE TABLE IF NOT EXISTS operation_deployments (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    preset_id TEXT NOT NULL REFERENCES deployment_presets(id) ON DELETE CASCADE,
    deployed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insp_container_assignments (
    template_id TEXT NOT NULL REFERENCES insp_templates(id) ON DELETE CASCADE,
    container_name TEXT NOT NULL,
    PRIMARY KEY (template_id, container_name)
  );
`);

// ── Runtime migrations (safe ALTER TABLE — swallowed if column already exists) ─
const migrations = [
  "ALTER TABLE searcher_checkins ADD COLUMN last_heard_at TEXT",
  "ALTER TABLE tasks ADD COLUMN search_type TEXT",
  "ALTER TABLE tasks ADD COLUMN team_type TEXT",
  "ALTER TABLE tasks ADD COLUMN current_assignment TEXT",
  "ALTER TABLE tasks ADD COLUMN planned_tasks TEXT",
  "ALTER TABLE equipment ADD COLUMN barcode TEXT",
  "ALTER TABLE equipment ADD COLUMN model TEXT",
  "ALTER TABLE insp_results ADD COLUMN container_name TEXT",
  "ALTER TABLE operations ADD COLUMN caltopo_features TEXT",
  "ALTER TABLE personnel ADD COLUMN member_status TEXT",
  "ALTER TABLE equipment ADD COLUMN custom_tags TEXT",
  "ALTER TABLE operations ADD COLUMN d4h_activity_type TEXT",
  "ALTER TABLE operations ADD COLUMN d4h_callout_id TEXT",
  "ALTER TABLE operations ADD COLUMN deploy_decision TEXT",
  "ALTER TABLE operations ADD COLUMN deploy_timestamp TEXT",
  "ALTER TABLE operations ADD COLUMN weather_snapshot TEXT",
  "ALTER TABLE operations ADD COLUMN sync_version INTEGER DEFAULT 1",
  "ALTER TABLE operations ADD COLUMN ipp_type TEXT DEFAULT 'lkp'",
  "ALTER TABLE operations ADD COLUMN terrain_type TEXT DEFAULT 'forest'",
  "ALTER TABLE operations ADD COLUMN pls_location TEXT",
  "ALTER TABLE operations ADD COLUMN pls_lat REAL",
  "ALTER TABLE operations ADD COLUMN pls_lon REAL",
  "ALTER TABLE operations ADD COLUMN pls_time TEXT",
  "ALTER TABLE operations ADD COLUMN reported_time TEXT",
  "ALTER TABLE operations ADD COLUMN subject_circumstance TEXT",
  "ALTER TABLE operations ADD COLUMN d4h_exercise_id TEXT",
  "ALTER TABLE operations ADD COLUMN subject_condition TEXT",
  "ALTER TABLE operations ADD COLUMN lost_person_description TEXT",
  "ALTER TABLE operations ADD COLUMN lkp_notes TEXT",
  "ALTER TABLE operations ADD COLUMN mutual_aid_orgs TEXT",
  "ALTER TABLE operations ADD COLUMN deployed_presets_json TEXT DEFAULT '[]'",
  "ALTER TABLE operations ADD COLUMN requested_vehicles TEXT",
  // These were in the original CREATE TABLE but may be missing in older installs
  "ALTER TABLE operations ADD COLUMN d4h_incident_id TEXT",
  "ALTER TABLE operations ADD COLUMN caltopo_map_url TEXT",
  "ALTER TABLE operations ADD COLUMN ipp_direct_disabled INTEGER DEFAULT 0",
  "ALTER TABLE operations ADD COLUMN police_file_number TEXT",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch { /* column already exists */ }
}

// ── Seed default SM account ───────────────────────────────────────────────────
//
// SECURITY: We MUST NOT hardcode a known default password (e.g., "admin123").
// A hardcoded default is trivially enumerated by attackers and is listed in
// OWASP Top 10 2021 A07 — Identification and Authentication Failures.
//
// APPROACH: On first run, generate a cryptographically random initial password,
// write it to a plaintext file in the user-owned data directory, and print the
// path to the console.  The SM reads the file, logs in, and should change the
// password immediately via Settings.
//
// The credentials file is NOT deleted automatically because the SM may need to
// recover it if they forget the password before changing it.  Document this in
// the onboarding instructions.

function ensurePersonnel(userId: string, name: string, role: string) {
  const existing = db.prepare('SELECT id FROM personnel WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare(`INSERT INTO personnel (id, name, user_id, role, status) VALUES (?, ?, ?, ?, 'available')`)
      .run(randomUUID(), name, userId, role);
  }
}

const adminRow = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
if (!adminRow) {
  // First run — generate a random initial password instead of using a known default.
  // crypto.randomBytes(16) produces 16 bytes of CSPRNG output = 32 hex characters.
  // This is ~128 bits of entropy, far exceeding NIST SP 800-63B requirements.
  const { randomBytes } = require('crypto') as typeof import('crypto');
  const initialPassword = randomBytes(16).toString('hex'); // e.g. "a3f1e8c90d2b..."

  const adminId = randomUUID();
  db.prepare(`INSERT INTO users (id, username, email, password_hash, role, display_name)
    VALUES (?, 'admin', 'admin@sar-manager.local', ?, 'sm', 'Admin')`)
    .run(adminId, bcrypt.hashSync(initialPassword, 12)); // bcrypt cost 12 (OWASP recommended minimum)
  ensurePersonnel(adminId, 'Admin', 'Search Manager');

  // Write credentials to a local file the SM can read at first login
  const credFile = path.join(DATA_DIR, 'INITIAL_CREDENTIALS.txt');
  const credContent = [
    '================================================',
    '  SAR Manager — Initial Administrator Credentials',
    '================================================',
    '',
    `  Username : admin`,
    `  Password : ${initialPassword}`,
    '',
    '  IMPORTANT: Log in and change this password in',
    '  Settings → Users immediately.',
    '',
    `  Generated: ${new Date().toISOString()}`,
    '================================================',
  ].join('\n');

  try {
    fs.writeFileSync(credFile, credContent, { encoding: 'utf8', mode: 0o600 }); // owner read/write only
    console.info(`\n[SAR Manager] First-run setup complete.`);
    console.info(`[SAR Manager] Initial credentials written to: ${credFile}\n`);
  } catch (writeErr) {
    // If the file cannot be written (e.g., permissions), log the password to
    // the console as a fallback — better than silent failure.
    console.warn('[SAR Manager] Could not write credentials file. Initial password:', initialPassword);
  }
} else {
  ensurePersonnel(adminRow.id, 'Admin', 'Search Manager');
}

export default db;
export { randomUUID };
