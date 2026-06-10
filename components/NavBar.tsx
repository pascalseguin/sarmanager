'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';

function TeamSelector() {
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchTeams() {
    if (teams.length) return; // already loaded
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getTeams', token: settings.d4hToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load teams');
      setTeams(data.teams ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function select(team: { id: number; name: string }) {
    updateSettings({ d4hTeamId: String(team.id), d4hTeamName: team.name });
    setOpen(false);
  }

  if (!settings.d4hToken) return null;

  const label = settings.d4hTeamName || (settings.d4hTeamId ? `Team ${settings.d4hTeamId}` : 'Select team');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(prev => !prev); if (!open) fetchTeams(); }}
        className="flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        <span className="max-w-32 truncate">{label}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-48 max-w-64 overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            D4H Team
          </div>
          {loading && <div className="px-4 py-3 text-xs text-gray-500">Loading teams…</div>}
          {error && <div className="px-4 py-3 text-xs text-red-600">{error}</div>}
          {!loading && teams.length === 0 && !error && (
            <div className="px-4 py-3 text-xs text-gray-400">No teams found</div>
          )}
          {teams.map((t, i) => (
            <button
              key={t.id}
              onClick={() => select(t)}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${i > 0 ? 'border-t border-gray-100' : ''} ${String(t.id) === settings.d4hTeamId ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-700'}`}
            >
              {String(t.id) === settings.d4hTeamId && <span className="text-blue-600">✓</span>}
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user || pathname === '/login' || pathname.startsWith('/checkin/')) return null;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  const link = (href: string, label: string) => (
    <Link href={href}
      className={`text-sm transition-colors ${pathname === href || pathname.startsWith(href + '/') ? 'text-white font-semibold' : 'text-gray-300 hover:text-white'}`}>
      {label}
    </Link>
  );

  return (
    <nav className="bg-gray-800 text-white px-6 py-3 flex items-center gap-6">
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
        <img src="/favicon.svg" alt="SAR Manager" className="w-6 h-6" />
        <span className="font-semibold">SAR Manager</span>
      </Link>
      {link('/operations', 'Operations')}
      {link('/personnel', 'Personnel')}
      {link('/equipment', 'Equipment')}
      {link('/settings', 'Settings')}
      <div className="ml-auto flex items-center gap-3">
        {link('/logs', 'Logs')}
        <TeamSelector />
        <span className="text-xs text-gray-400">{user.displayName ?? user.username}</span>
        <button onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  );
}
