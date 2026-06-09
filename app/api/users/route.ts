import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

function syncPersonnel(userId: string) {
  const u = db.prepare("SELECT id, display_name, qualifications, phone, role FROM users WHERE id = ?").get(userId) as any;
  if (!u) return;
  const name = u.display_name || u.username;
  const existing = db.prepare("SELECT id FROM personnel WHERE user_id = ?").get(userId) as any;
  if (existing) {
    db.prepare("UPDATE personnel SET name=?, qualifications=?, contact=?, updated_at=datetime('now') WHERE user_id=?")
      .run(name, u.qualifications ?? null, u.phone ?? null, userId);
  } else {
    db.prepare("INSERT INTO personnel (id, name, qualifications, contact, user_id, role, status) VALUES (?,?,?,?,?,?,'available')")
      .run(randomUUID(), name, u.qualifications ?? null, u.phone ?? null, userId,
        u.role === 'sm' ? 'Search Manager' : 'IMT Member');
  }
}

export async function GET(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_active,
           u.last_login, u.created_at, u.qualifications, u.phone,
           u.emergency_contact, u.emergency_phone, p.id AS personnel_id
    FROM users u LEFT JOIN personnel p ON p.user_id = u.id ORDER BY u.created_at ASC
  `).all();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  try {
    const { username, password, role, displayName, email, qualifications, phone } = await req.json();
    if (!username || !password) return NextResponse.json({ error: 'username and password required' }, { status: 400 });
    if (!['sm', 'admin'].includes(role)) return NextResponse.json({ error: 'role must be sm or admin' }, { status: 400 });
    const resolvedEmail = email || `${username}@sar-manager.local`;
    if (db.prepare("SELECT id FROM users WHERE username=? OR email=?").get(username, resolvedEmail)) {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 });
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO users (id, username, email, password_hash, role, display_name, qualifications, phone)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, username, resolvedEmail, bcrypt.hashSync(password, 10), role, displayName ?? null, qualifications ?? null, phone ?? null);
    syncPersonnel(id);
    const user = db.prepare(`SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_active, u.created_at, p.id AS personnel_id
      FROM users u LEFT JOIN personnel p ON p.user_id = u.id WHERE u.id = ?`).get(id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}
