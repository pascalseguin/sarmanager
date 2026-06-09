import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db, { randomUUID } from '@/lib/db';
import { getSessionUser, requireAuth, isNextResponse } from '@/lib/auth-server';

// POST /api/auth — login
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
    db.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), user.id, token, expiresAt);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name ?? null,
        qualifications: user.qualifications ?? null,
        phone: user.phone ?? null,
      },
      expiresIn: 86400,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

// GET /api/auth — me
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as any;
  if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: u.id,
      username: u.username,
      role: u.role,
      displayName: u.display_name ?? null,
      qualifications: u.qualifications ?? null,
      phone: u.phone ?? null,
      emergencyContact: u.emergency_contact ?? null,
      emergencyPhone: u.emergency_phone ?? null,
    },
  });
}

// PUT /api/auth — update profile
export async function PUT(req: NextRequest) {
  const result = requireAuth(req);
  if (isNextResponse(result)) return result;

  try {
    const { displayName, qualifications, phone, emergencyContact, emergencyPhone } = await req.json();
    db.prepare(`UPDATE users SET display_name=?, qualifications=?, phone=?, emergency_contact=?, emergency_phone=?, updated_at=datetime('now') WHERE id=?`)
      .run(displayName ?? null, qualifications ?? null, phone ?? null, emergencyContact ?? null, emergencyPhone ?? null, result.id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }
}

// DELETE /api/auth — logout
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.substring(7).trim();
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  return NextResponse.json({ success: true });
}
