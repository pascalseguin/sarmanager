import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db, { randomUUID } from '@/lib/db';
import { requireSM, isNextResponse } from '@/lib/auth-server';

function syncPersonnel(userId: string) {
  const u = db.prepare("SELECT id, display_name, username, qualifications, phone, role FROM users WHERE id = ?").get(userId) as any;
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { password, role, isActive, displayName, qualifications, phone, emergencyContact, emergencyPhone } = await req.json();
    if (password !== undefined) {
      db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?")
        .run(bcrypt.hashSync(password, 10), id);
    }
    if (role !== undefined) {
      if (!['sm', 'admin'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      db.prepare("UPDATE users SET role=?, updated_at=datetime('now') WHERE id=?").run(role, id);
    }
    if (isActive !== undefined) {
      db.prepare("UPDATE users SET is_active=?, updated_at=datetime('now') WHERE id=?").run(isActive ? 1 : 0, id);
      if (!isActive) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    }
    for (const [col, val] of [
      ['display_name', displayName], ['qualifications', qualifications],
      ['phone', phone], ['emergency_contact', emergencyContact], ['emergency_phone', emergencyPhone],
    ] as [string, unknown][]) {
      if (val !== undefined) {
        db.prepare(`UPDATE users SET ${col}=?, updated_at=datetime('now') WHERE id=?`).run(val ?? null, id);
      }
    }
    syncPersonnel(id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSM(req);
  if (isNextResponse(result)) return result;
  const { id } = await params;
  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(id) as any;
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.username === 'admin') return NextResponse.json({ error: 'Cannot delete admin account' }, { status: 400 });
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  return NextResponse.json({ success: true });
}
