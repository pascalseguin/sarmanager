'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';

/* ── Sidebar nav item ── */
function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link href={href} className={`nav-item ${active ? 'active' : ''}`}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      {label}
    </Link>
  );
}

/* ── Team selector dropdown ── */
function TeamSelector() {
  const { settings, updateSettings } = useSettings();
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!settings.d4hTeamId || !settings.d4hToken) return;
    // Re-fetch if name is missing or looks like a fallback ID placeholder
    const isPlaceholder = !settings.d4hTeamName || /^Team \d+$/.test(settings.d4hTeamName);
    if (!isPlaceholder) return;
    authFetch('/api/d4h', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getTeamInfo', token: settings.d4hToken, teamId: Number(settings.d4hTeamId) }),
    }).then(r => r.json()).then(d => {
      if (d.name && !/^Team \d+$/.test(d.name)) updateSettings({ d4hTeamName: d.name });
    }).catch(() => {});
  }, [settings.d4hTeamId, settings.d4hTeamName, settings.d4hToken]);

  async function fetchTeams() {
    if (teams.length) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/d4h', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getTeams', token: settings.d4hToken }),
      });
      const data = await res.json();
      const fetched: { id: number; name: string; logo?: string }[] = data.teams ?? [];
      setTeams(fetched);
      if (settings.d4hTeamId && !settings.d4hTeamName) {
        const match = fetched.find(t => String(t.id) === settings.d4hTeamId);
        if (match?.name) updateSettings({ d4hTeamName: match.name });
      }
    } finally { setLoading(false); }
  }

  if (!settings.d4hToken) return null;

  const label = settings.d4hTeamName || (settings.d4hTeamId ? `Team ${settings.d4hTeamId}` : 'Select team');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(v => !v); if (!open) fetchTeams(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.12s' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0, display: 'inline-block' }} />
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 220, maxWidth: 280, zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)' }}>D4H Team</div>
          {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && teams.length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No teams found</div>}
          {teams.map((t, i) => (
            <button key={t.id} onClick={() => { updateSettings({ d4hTeamId: String(t.id), d4hTeamName: t.name }); setOpen(false); }}
              style={{ width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: String(t.id) === settings.d4hTeamId ? 'rgba(59,130,246,0.12)' : 'none', color: String(t.id) === settings.d4hTeamId ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => { if (String(t.id) !== settings.d4hTeamId) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (String(t.id) !== settings.d4hTeamId) e.currentTarget.style.background = 'none'; }}
            >
              {String(t.id) === settings.d4hTeamId && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Full app shell ── */
export default function NavBar() {
  const { user, logout, authFetch } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = !user || pathname === '/login' || pathname.startsWith('/checkin/') || pathname.startsWith('/portal');
  if (isPublic) return null;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <>
      {/* ── Top header ── */}
      <header className="app-header">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/favicon.svg" alt="" style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.3px' }}>SAR Manager</span>
        </Link>

        <div style={{ flex: 1 }} />

        <TeamSelector />

        <div className="divider" />

        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.displayName ?? user.username}</span>

        <button onClick={handleLogout} className="btn btn-ghost btn-sm">Sign out</button>
      </header>

      {/* ── Left sidebar ── */}
      <aside className="app-sidebar">
        <div className="nav-section-label">Operations</div>
        <NavItem href="/operations" label="Operations" icon="📋" />
        <NavItem href="/personnel" label="Roster" icon="👥" />
        <NavItem href="/equipment" label="Equipment" icon="🎒" />

        <div className="nav-section-label" style={{ marginTop: 8 }}>System</div>
        <NavItem href="/users" label="Users" icon="🔑" />
        <NavItem href="/settings" label="Settings" icon="⚙️" />
        <NavItem href="/logs" label="Logs" icon="📄" />
      </aside>

      {/* ── Content offset ── */}
      {/* Applied via .app-content on each page */}
    </>
  );
}
