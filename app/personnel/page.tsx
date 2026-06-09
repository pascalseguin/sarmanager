'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';

interface Personnel {
  id: string;
  name: string;
  role?: string;
  status?: string;
  qualifications?: string;
  contact?: string;
  phone?: string;
  notes?: string;
  d4h_member_id?: number;
}

export default function PersonnelPage() {
  const { user, loading, authFetch } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  const [roster, setRoster] = useState<Personnel[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState('');

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', qualifications: '', phone: '', contact: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // D4H import
  const [importOpen, setImportOpen] = useState(false);
  const [d4hMembers, setD4hMembers] = useState<{ id: number; name: string; status: string; group?: string }[]>([]);
  const [loadingD4H, setLoadingD4H] = useState(false);
  const [selectedD4H, setSelectedD4H] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  async function loadRoster() {
    setLoadingRoster(true);
    try {
      const res = await authFetch('/api/personnel');
      const data = await res.json();
      setRoster(data.personnel ?? []);
    } catch { setError('Failed to load roster'); }
    finally { setLoadingRoster(false); }
  }

  useEffect(() => { if (user) loadRoster(); }, [user]);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoster(prev => [...prev, data.personnel]);
      setForm({ name: '', role: '', qualifications: '', phone: '', contact: '', notes: '' });
      setShowAdd(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setSaving(false);
    }
  }

  async function deletePerson(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return;
    try {
      await authFetch(`/api/personnel/${id}`, { method: 'DELETE' });
      setRoster(prev => prev.filter(p => p.id !== id));
    } catch { setError('Failed to delete'); }
  }

  async function loadD4HMembers() {
    if (!settings.d4hToken) { setImportMsg('D4H token not configured — go to Settings first.'); return; }
    setLoadingD4H(true); setImportMsg('');
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getMembers', token: settings.d4hToken }),
      });
      const data = await res.json();
      setD4hMembers((data.members ?? []).map((m: any) => ({
        id: m.id, name: m.name,
        status: m.status ?? '',
        group: m.group?.title ?? m.team?.name ?? '',
      })));
    } catch { setImportMsg('Failed to load D4H members.'); }
    finally { setLoadingD4H(false); }
  }

  async function importSelected() {
    if (!selectedD4H.size) return;
    setImporting(true); setImportMsg('');
    let imported = 0;
    for (const memberId of selectedD4H) {
      const m = d4hMembers.find(x => x.id === memberId);
      if (!m) continue;
      try {
        const res = await authFetch('/api/personnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.name, role: 'Ground Searcher', qualifications: m.group ?? '' }),
        });
        if (res.ok) imported++;
      } catch { /* skip */ }
    }
    setImportMsg(`Imported ${imported} member${imported !== 1 ? 's' : ''}.`);
    setSelectedD4H(new Set());
    loadRoster();
    setImporting(false);
  }

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    deployed: 'bg-blue-100 text-blue-700',
    off_duty: 'bg-gray-100 text-gray-500',
    pending: 'bg-yellow-100 text-yellow-700',
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Personnel Roster</h1>
          <div className="flex gap-2">
            <button onClick={() => { setImportOpen(prev => !prev); if (!importOpen && d4hMembers.length === 0) loadD4HMembers(); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Import from D4H
            </button>
            <button onClick={() => setShowAdd(prev => !prev)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              + Add Person
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {/* Add form */}
        {showAdd && (
          <form onSubmit={addPerson} className="bg-white rounded-xl shadow p-5 mb-4 space-y-3">
            <div className="font-semibold text-gray-800">New Roster Member</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Ground Searcher"
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel"
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Qualifications</label>
                <input value={form.qualifications} onChange={e => setForm(f => ({ ...f, qualifications: e.target.value }))}
                  placeholder="SRT, Swiftwater…"
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Add to Roster'}
              </button>
            </div>
          </form>
        )}

        {/* D4H import panel */}
        {importOpen && (
          <div className="bg-white rounded-xl shadow p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-800">Import from D4H</div>
              {importMsg && <span className="text-sm text-green-700 font-medium">{importMsg}</span>}
            </div>
            {loadingD4H && <p className="text-sm text-gray-500">Loading members…</p>}
            {d4hMembers.length > 0 && (
              <>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setSelectedD4H(new Set(d4hMembers.map(m => m.id)))}
                    className="text-xs text-blue-600 hover:underline">Select all</button>
                  <button onClick={() => setSelectedD4H(new Set())}
                    className="text-xs text-gray-500 hover:underline">None</button>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto mb-3">
                  {d4hMembers.map((m, i) => (
                    <label key={m.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${selectedD4H.has(m.id) ? 'bg-blue-50' : 'bg-white'}`}>
                      <input type="checkbox" checked={selectedD4H.has(m.id)} onChange={() => {
                        setSelectedD4H(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; });
                      }} className="w-4 h-4 accent-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{m.name}</div>
                        {m.group && <div className="text-xs text-gray-500">{m.group}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={importSelected} disabled={importing || !selectedD4H.size}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {importing ? 'Importing…' : `Import ${selectedD4H.size} selected`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Roster table */}
        {loadingRoster ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">Loading roster…</div>
        ) : roster.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
            <p className="mb-2">No personnel in roster.</p>
            <p className="text-sm">Add people manually or import from D4H.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0">
              <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">Name / Role</div>
              <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">Status</div>
              <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">Phone</div>
              <div className="px-4 py-2.5 border-b border-gray-100"></div>
              {roster.map((p, i) => (
                <>
                  <div key={`n${p.id}`} className={`px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.role ?? '—'}</div>
                    {p.qualifications && <div className="text-xs text-blue-600 mt-0.5">{p.qualifications}</div>}
                  </div>
                  <div key={`s${p.id}`} className={`px-4 py-3 flex items-center ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[p.status ?? 'available'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status ?? 'available'}
                    </span>
                  </div>
                  <div key={`p${p.id}`} className={`px-4 py-3 flex items-center text-sm text-gray-600 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    {p.phone ?? p.contact ?? '—'}
                  </div>
                  <div key={`a${p.id}`} className={`px-4 py-3 flex items-center ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <button onClick={() => deletePerson(p.id, p.name)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                  </div>
                </>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3 text-center">
          {roster.length} member{roster.length !== 1 ? 's' : ''} on roster
        </p>
      </div>
    </div>
  );
}
