'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';

interface Personnel {
  id: string; name: string; role?: string; status?: string;
  qualifications?: string; contact?: string; phone?: string; notes?: string;
  d4h_member_id?: number;
}

// ── D4H CSV parser (mirrors Electron RosterPanel) ─────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []; let inQuote = false; let cur = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

interface ParsedMember { name: string; phone: string; qualifications: string[] }

function parseD4HCSV(text: string): ParsedMember[] {
  const clean = text.replace(/^﻿/, '').replace(/^ï»¿/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase());
  const nameIdx   = header.indexOf('name');
  const mobileIdx = header.indexOf('mobile phone');
  const homeIdx   = header.indexOf('home phone');
  const workIdx   = header.indexOf('work phone');
  const groupsIdx = header.indexOf('groups');
  const statusIdx = header.findIndex(h => h.includes('status') || h.includes('member'));
  if (nameIdx === -1) return [];
  return lines.slice(1).flatMap(line => {
    const cols = parseCSVLine(line);
    const rawName = cols[nameIdx]?.replace(/"/g, '').trim() ?? '';
    if (!rawName.includes(',')) return [];
    const parts = rawName.split(',');
    const name = `${parts.slice(1).join(' ').trim()} ${parts[0].trim()}`.trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) return [];
    if (statusIdx >= 0) {
      const st = cols[statusIdx]?.replace(/"/g, '').trim().toLowerCase() ?? '';
      if (['inactive','archived','removed'].includes(st)) return [];
    }
    const phone = [mobileIdx, homeIdx, workIdx]
      .map(i => (i >= 0 ? cols[i]?.replace(/"/g, '').trim() : ''))
      .find(p => p && p.length > 0) ?? '';
    const rawGroups = groupsIdx >= 0 ? cols[groupsIdx]?.replace(/"/g, '').trim() ?? '' : '';
    const quals = rawGroups.split(',').map(g => g.replace(/^(Team|Group)\s*[-–]\s*/i, '').trim()).filter(Boolean);
    return [{ name, phone, qualifications: quals }];
  });
}

// ── SAR qualifications ────────────────────────────────────────────────────────

const SAR_QUALS = ['Ground','Medical-FR','Medical-EMT','Medical-Paramedic','Rope-Basic','Rope-Advanced',
  'Swiftwater','ATV','Snowmobile','Canine','Drone/UAS','Mountain','Navigator','Radio Op','IC','Plans','Logistics','Driver'];

const ROLES = ['Ground Searcher','Team Leader','Search Manager','IMT','Medical','Logistics','Comms','K9 Handler','Rope Tech','IC'];

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  deployed:  'bg-blue-100 text-blue-700',
  off_duty:  'bg-gray-100 text-gray-500',
  pending:   'bg-yellow-100 text-yellow-700',
};

export default function PersonnelPage() {
  const { user, loading, authFetch } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  const [roster, setRoster]   = useState<Personnel[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editId, setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Personnel>>({});
  const [onCallMap, setOnCallMap] = useState<Map<number, string | null>>(new Map());

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'Ground Searcher', qualifications: '', phone: '', contact: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // D4H import
  const [importOpen, setImportOpen] = useState(false);
  const [d4hMembers, setD4hMembers] = useState<{ id: number; name: string; status: string; group?: string }[]>([]);
  const [loadingD4H, setLoadingD4H] = useState(false);
  const [selectedD4H, setSelectedD4H] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // CSV import
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<ParsedMember[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMsg, setCsvMsg] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading]);

  async function loadRoster() {
    setLoadingRoster(true);
    try {
      const res = await authFetch('/api/personnel');
      const data = await res.json();
      setRoster(data.personnel ?? []);
    } catch { setError('Failed to load roster'); }
    finally { setLoadingRoster(false); }
  }

  // Best-effort on-call status from D4H
  function d4hBody(action: string, extra: object = {}) {
    return JSON.stringify({
      action,
      token: settings.d4hToken,
      ...(settings.d4hTeamId ? { teamId: Number(settings.d4hTeamId) } : {}),
      ...extra,
    });
  }

  async function loadOnCall() {
    if (!settings.d4hToken) return;
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: d4hBody('getOnCall'),
      });
      if (!res.ok) return;
      const data = await res.json();
      const map = new Map<number, string | null>();
      for (const entry of data.onCall ?? []) map.set(entry.memberId, entry.endsAt ?? null);
      setOnCallMap(map);
    } catch { /* non-fatal */ }
  }

  useEffect(() => { if (user) { loadRoster(); loadOnCall(); } }, [user]);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await authFetch('/api/personnel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoster(prev => [...prev, data.personnel]);
      setForm({ name: '', role: 'Ground Searcher', qualifications: '', phone: '', contact: '', notes: '' });
      setShowAdd(false);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add'); }
    finally { setSaving(false); }
  }

  async function saveEdit(id: string) {
    try {
      const res = await authFetch(`/api/personnel/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoster(prev => prev.map(p => p.id === id ? data.personnel : p));
      setEditId(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save'); }
  }

  async function deletePerson(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return;
    await authFetch(`/api/personnel/${id}`, { method: 'DELETE' });
    setRoster(prev => prev.filter(p => p.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function bulkDelete() {
    if (!selected.size || !confirm(`Remove ${selected.size} member(s)?`)) return;
    await Promise.all([...selected].map(id => authFetch(`/api/personnel/${id}`, { method: 'DELETE' })));
    setRoster(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set());
  }

  async function loadD4HMembers() {
    if (!settings.d4hToken) { setImportMsg('D4H token not configured.'); return; }
    setLoadingD4H(true); setImportMsg('');
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: d4hBody('getMembers'),
      });
      const data = await res.json();
      setD4hMembers((data.members ?? []).map((m: any) => ({
        id: m.id, name: m.name, status: m.status ?? '', group: m.group?.title ?? m.team?.name ?? '',
      })));
    } catch { setImportMsg('Failed to load D4H members.'); }
    finally { setLoadingD4H(false); }
  }

  async function importSelected() {
    if (!selectedD4H.size) return;
    setImporting(true); setImportMsg('');
    const existingNames = new Set(roster.map(r => r.name.toLowerCase()));
    let imported = 0; let skipped = 0;
    for (const memberId of selectedD4H) {
      const m = d4hMembers.find(x => x.id === memberId);
      if (!m || existingNames.has(m.name.toLowerCase())) { skipped++; continue; }
      try {
        const res = await authFetch('/api/personnel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.name, role: 'Ground Searcher', qualifications: m.group ?? '', d4h_member_id: m.id }),
        });
        if (res.ok) { imported++; existingNames.add(m.name.toLowerCase()); }
      } catch { /* skip */ }
    }
    setImportMsg(`Imported ${imported}, skipped ${skipped} (already in roster).`);
    setSelectedD4H(new Set());
    loadRoster();
    setImporting(false);
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseD4HCSV(text);
      if (!parsed.length) { setCsvMsg('No valid members found. Make sure it is a D4H "Members > Export" CSV.'); return; }
      setCsvPreview(parsed);
      setShowCsvPreview(true);
      setCsvMsg('');
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  async function confirmCSVImport() {
    setCsvImporting(true); setCsvMsg('');
    const existingNames = new Set(roster.map(r => r.name.toLowerCase()));
    let added = 0; let skipped = 0;
    for (const m of csvPreview) {
      if (existingNames.has(m.name.toLowerCase())) { skipped++; continue; }
      try {
        const res = await authFetch('/api/personnel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.name, phone: m.phone, role: 'Ground Searcher', qualifications: m.qualifications.join(', ') }),
        });
        if (res.ok) { added++; existingNames.add(m.name.toLowerCase()); }
      } catch { /* skip */ }
    }
    setCsvMsg(`CSV import: ${added} added, ${skipped} already in roster.`);
    setShowCsvPreview(false);
    setCsvPreview([]);
    loadRoster();
    setCsvImporting(false);
  }

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll   = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));

  const filtered = roster.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.qualifications ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.role ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-5xl mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Personnel Roster</h1>
          <div className="flex gap-2">
            <button onClick={() => { setImportOpen(prev => !prev); if (!importOpen && !d4hMembers.length) loadD4HMembers(); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Import from D4H</button>
            <label className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              ↑ CSV
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFile} />
            </label>
            <button onClick={() => setShowAdd(prev => !prev)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Add</button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {csvMsg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{csvMsg}</div>}

        {/* Add form */}
        {showAdd && (
          <form onSubmit={addPerson} className="bg-white rounded-xl shadow p-5 space-y-3">
            <div className="font-semibold text-gray-800">New Roster Member</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone * (for check-in auth)</label>
                <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel"
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Qualifications (comma-separated)</label>
                <div className="flex flex-wrap gap-1.5">
                  {SAR_QUALS.map(q => {
                    const on = form.qualifications.split(',').map(s => s.trim()).includes(q);
                    return (
                      <button key={q} type="button" onClick={() => {
                        const current = form.qualifications.split(',').map(s => s.trim()).filter(Boolean);
                        const next = on ? current.filter(x => x !== q) : [...current, q];
                        setForm(f => ({ ...f, qualifications: next.join(', ') }));
                      }} className={`px-2 py-0.5 rounded text-xs border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Contact</label>
                <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
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
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-800">Import from D4H</div>
              {importMsg && <span className="text-sm text-green-700">{importMsg}</span>}
            </div>
            {loadingD4H && <p className="text-sm text-gray-500">Loading members…</p>}
            {d4hMembers.length > 0 && (
              <>
                <div className="flex gap-3 mb-2 text-xs">
                  <button onClick={() => setSelectedD4H(new Set(d4hMembers.map(m => m.id)))} className="text-blue-600 hover:underline">Select all</button>
                  <button onClick={() => setSelectedD4H(new Set())} className="text-gray-500 hover:underline">None</button>
                  <span className="text-gray-400">Members already in roster will be skipped.</span>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto mb-3">
                  {d4hMembers.map((m, i) => {
                    const inRoster = roster.some(r => r.name.toLowerCase() === m.name.toLowerCase());
                    return (
                      <label key={m.id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${selectedD4H.has(m.id) ? 'bg-blue-50' : ''} ${inRoster ? 'opacity-50' : ''}`}>
                        <input type="checkbox" checked={selectedD4H.has(m.id)} disabled={inRoster}
                          onChange={() => { setSelectedD4H(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; }); }}
                          className="w-4 h-4 accent-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{m.name}</div>
                          {m.group && <div className="text-xs text-gray-500">{m.group}</div>}
                        </div>
                        {inRoster && <span className="text-xs text-gray-400">in roster</span>}
                      </label>
                    );
                  })}
                </div>
                <button onClick={importSelected} disabled={importing || !selectedD4H.size}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {importing ? 'Importing…' : `Import ${selectedD4H.size} selected`}
                </button>
              </>
            )}
          </div>
        )}

        {/* CSV preview modal */}
        {showCsvPreview && (
          <div className="bg-white rounded-xl shadow p-5 border-2 border-blue-300">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold text-gray-800">CSV Preview — {csvPreview.length} members found</div>
              <button onClick={() => { setShowCsvPreview(false); setCsvPreview([]); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Members already in the roster will be skipped automatically.</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto mb-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Qualifications</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((m, i) => {
                    const inRoster = roster.some(r => r.name.toLowerCase() === m.name.toLowerCase());
                    return (
                      <tr key={i} className={`border-t border-gray-100 ${inRoster ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-1.5 font-medium">{m.name} {inRoster && <span className="text-xs text-gray-400">(skip)</span>}</td>
                        <td className="px-3 py-1.5 text-gray-600">{m.phone || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 text-xs">{m.qualifications.join(', ') || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCsvPreview(false); setCsvPreview([]); }}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmCSVImport} disabled={csvImporting}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {csvImporting ? 'Importing…' : `Import ${csvPreview.filter(m => !roster.some(r => r.name.toLowerCase() === m.name.toLowerCase())).length} new members`}
              </button>
            </div>
          </div>
        )}

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-3 text-sm">
            <span className="font-medium text-blue-700">{selected.size} selected</span>
            <button onClick={bulkDelete} className="text-red-500 hover:underline">Delete selected</button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-500 hover:underline">Clear</button>
          </div>
        )}

        {/* Search bar */}
        <div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, role, qualifications…"
            className="w-full p-2.5 border border-gray-300 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Roster table */}
        {loadingRoster ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">Loading roster…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
            {roster.length === 0 ? 'No personnel in roster. Add people manually or import from D4H.' : 'No results for this search.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-4 py-2 border-b bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide gap-3">
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll} className="w-3.5 h-3.5" />
              <span className="flex-1">Name / Qualifications</span>
              <span className="w-28 hidden sm:block">Role</span>
              <span className="w-28 hidden md:block">Phone</span>
              <span className="w-20">Status</span>
              <span className="w-20">Actions</span>
            </div>

            {filtered.map((p, i) => {
              const isOnCall = p.d4h_member_id && onCallMap.has(p.d4h_member_id);
              return editId === p.id ? (
                <div key={p.id} className="px-4 py-3 border-b bg-blue-50 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Name</label>
                      <input value={editForm.name ?? p.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Phone</label>
                      <input value={editForm.phone ?? p.phone ?? ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Role</label>
                      <select value={editForm.role ?? p.role ?? ''} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                        className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Emergency Contact</label>
                      <input value={editForm.contact ?? p.contact ?? ''} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))}
                        className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <label className="text-xs text-gray-500 block mb-1">Qualifications</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SAR_QUALS.map(q => {
                          const current = (editForm.qualifications ?? p.qualifications ?? '').split(',').map(s => s.trim());
                          const on = current.includes(q);
                          return (
                            <button key={q} type="button" onClick={() => {
                              const arr = current.filter(Boolean);
                              const next = on ? arr.filter(x => x !== q) : [...arr, q];
                              setEditForm(f => ({ ...f, qualifications: next.join(', ') }));
                            }} className={`px-2 py-0.5 rounded text-xs border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                              {q}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="px-3 py-1 border rounded text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button onClick={() => saveEdit(p.id)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Save</button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''} ${selected.has(p.id) ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-3.5 h-3.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{p.name}</span>
                      {isOnCall && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">ON-CALL</span>
                      )}
                    </div>
                    {p.qualifications && (
                      <div className="text-xs text-blue-600 mt-0.5 truncate">{p.qualifications}</div>
                    )}
                  </div>
                  <span className="w-28 text-xs text-gray-500 hidden sm:block truncate">{p.role ?? '—'}</span>
                  <span className="w-28 text-xs text-gray-600 hidden md:block truncate">{p.phone ?? p.contact ?? '—'}</span>
                  <div className="w-20">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[p.status ?? 'available'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status ?? 'available'}
                    </span>
                  </div>
                  <div className="w-20 flex gap-2 shrink-0">
                    <button onClick={() => { setEditId(p.id); setEditForm({}); }} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => deletePerson(p.id, p.name)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          {roster.length} member{roster.length !== 1 ? 's' : ''} · Phone number required for check-in authentication
        </p>
      </div>
    </div>
  );
}
