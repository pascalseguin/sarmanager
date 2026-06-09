import { NextRequest, NextResponse } from 'next/server';
import db from './db';

export interface SessionUser {
  id: string;
  username: string;
  role: string;
}

export function getSessionUser(req: NextRequest): SessionUser | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.substring(7).trim();
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.user_id, u.username, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).get(token) as any;

  if (!session) return null;
  return { id: session.user_id, username: session.username, role: session.role };
}

export function isSM(role: string) {
  return role === 'sm' || role === 'admin';
}

export function requireAuth(req: NextRequest): SessionUser | NextResponse {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return user;
}

export function requireSM(req: NextRequest): SessionUser | NextResponse {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!isSM(user.role)) return NextResponse.json({ error: 'Search Manager access required' }, { status: 403 });
  return user;
}

export function isNextResponse(v: SessionUser | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
