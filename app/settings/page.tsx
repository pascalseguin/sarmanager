'use client';

import { useState, useRef } from 'react';
import { useSettings } from '@/lib/settings-context';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [form, setForm] = useState({
    credentialId: settings.credentialId,
    secret: settings.secret,
    accountId: settings.accountId,
    folderId: settings.folderId,
    ippFolderId: settings.ippFolderId ?? '',
    ringFolderId: settings.ringFolderId ?? '',
    d4hToken: settings.d4hToken,
    d4hTeamId: settings.d4hTeamId,
    d4hTeamName: settings.d4hTeamName,
    hereApiKey: settings.hereApiKey,
  });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // D4H state
  const [d4hTest, setD4hTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; msg: string }>({ status: 'idle', msg: '' });
  const [d4hTeams, setD4hTeams] = useState<{ id: number; name: string }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // CalTopo folder state
  const [caltopoFolders, setCaltopoFolders] = useState<{ id: string; title: string }[] | null>(null);
  const [discoveringFolders, setDiscoveringFolders] = useState(false);
  const [newFolderName, setNewFolderName] = useState('SEASAR Operations');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderMsg, setFolderMsg] = useState('');

  async function testD4H() {
    const token = form.d4hToken.trim();
    if (!token) { setD4hTest({ status: 'error', msg: 'Enter a token first' }); return; }
    setD4hTest({ status: 'testing', msg: '' });
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testConnection', token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setD4hTest({ status: 'ok', msg: `Connected — ${data.teamName} (team ${data.teamId})` });
    } catch (e: unknown) {
      setD4hTest({ status: 'error', msg: e instanceof Error ? e.message : 'Connection failed' });
    }
  }

  async function loadTeams() {
    const token = form.d4hToken.trim();
    if (!token) return;
    setLoadingTeams(true);
    try {
      const res = await fetch('/api/d4h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getTeams', token }),
      });
      const data = await res.json();
      setD4hTeams(data.teams ?? []);
    } catch { /* ignore */ }
    finally { setLoadingTeams(false); }
  }

  async function discoverFolders() {
    if (!form.credentialId || !form.secret || !form.accountId) {
      setFolderMsg('Save CalTopo credentials first.'); return;
    }
    setDiscoveringFolders(true); setFolderMsg(''); setCaltopoFolders(null);
    try {
      const res = await fetch('/api/caltopo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discoverFolders', credentialId: form.credentialId, secret: form.secret, accountId: form.accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.folders?.length) setFolderMsg('No folders found — create one below.');
      else setCaltopoFolders(data.folders);
    } catch (e: unknown) {
      setFolderMsg(e instanceof Error ? e.message : 'Discovery failed');
    } finally { setDiscoveringFolders(false); }
  }

  async function createFolder() {
    if (!form.credentialId || !form.secret || !form.accountId) {
      setFolderMsg('Save CalTopo credentials first.'); return;
    }
    setCreatingFolder(true); setFolderMsg('');
    try {
      const res = await fetch('/api/caltopo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', credentialId: form.credentialId, secret: form.secret, accountId: form.accountId, title: newFolderName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(f => ({ ...f, folderId: data.folderId }));
      setFolderMsg(`Folder "${data.title}" created — ID saved.`);
    } catch (e: unknown) {
      setFolderMsg(e instanceof Error ? e.message : 'Failed to create folder');
    } finally { setCreatingFolder(false); }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleGeoJSONFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.type !== 'FeatureCollection') { alert('File must be a GeoJSON FeatureCollection'); return; }
        updateSettings({ defaultGeoJSON: parsed, defaultGeoJSONName: file.name });
      } catch { alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  };

  const field = (label: string, key: keyof typeof form, type = 'text', hint?: string) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[key] as string}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

        <form onSubmit={handleSave} className="space-y-6">

          {/* ── D4H ── */}
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">D4H Team Manager</h2>
            {field('API Token', 'd4hToken', 'password', 'D4H Team Manager → Account → Manage Personal Access Tokens.')}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button type="button" onClick={testD4H} disabled={d4hTest.status === 'testing'}
                className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {d4hTest.status === 'testing' ? 'Testing…' : 'Test Connection'}
              </button>
              <button type="button" onClick={loadTeams} disabled={loadingTeams}
                className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {loadingTeams ? 'Loading…' : 'Select Team →'}
              </button>
              {d4hTest.status === 'ok' && <span className="text-sm text-green-700 font-medium">✓ {d4hTest.msg}</span>}
              {d4hTest.status === 'error' && <span className="text-sm text-red-600">{d4hTest.msg}</span>}
            </div>

            {/* Team picker */}
            {d4hTeams.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Active Team</label>
                <select value={form.d4hTeamId}
                  onChange={e => {
                    const team = d4hTeams.find(t => String(t.id) === e.target.value);
                    setForm(f => ({ ...f, d4hTeamId: e.target.value, d4hTeamName: team?.name ?? '' }));
                  }}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900">
                  <option value="">— select a team —</option>
                  {d4hTeams.map(t => (
                    <option key={t.id} value={String(t.id)}>{t.name} (ID: {t.id})</option>
                  ))}
                </select>
                {form.d4hTeamName && (
                  <p className="text-xs text-green-700 mt-1">✓ Active team: <strong>{form.d4hTeamName}</strong></p>
                )}
              </div>
            )}

            {d4hTeams.length === 0 && form.d4hTeamName && (
              <p className="text-xs text-gray-500 mb-4">Active team: <strong>{form.d4hTeamName}</strong> — click "Select Team →" to change.</p>
            )}
          </div>

          {/* ── HERE Geocoding ── */}
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">HERE Geocoding</h2>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
              Free at <a href="https://developer.here.com/sign-up" target="_blank" rel="noreferrer" className="underline font-medium">developer.here.com/sign-up</a> — no credit card. Create a project → REST → Create API key.
            </div>
            {field('HERE API Key', 'hereApiKey', 'password')}
          </div>

          {/* ── CalTopo ── */}
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">CalTopo Service Account</h2>
            {field('Credential ID', 'credentialId')}
            {field('Secret', 'secret', 'password')}
            {field('Account ID', 'accountId')}

            {/* Folder picker */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Operations Folder ID</label>
              <input type="text" value={form.folderId}
                onChange={e => setForm(f => ({ ...f, folderId: e.target.value }))}
                placeholder="e.g. abc123"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 mb-2" />
              <p className="text-xs text-gray-500 mb-3">New maps will be placed inside this CalTopo folder.</p>

              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" onClick={discoverFolders} disabled={discoveringFolders}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
                  {discoveringFolders ? 'Searching…' : '↓ Browse existing folders'}
                </button>
                <span className="text-xs text-gray-400">or create new:</span>
                <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded w-40 text-gray-900" />
                <button type="button" onClick={createFolder} disabled={creatingFolder}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
                  {creatingFolder ? 'Creating…' : '+ Create'}
                </button>
              </div>

              {folderMsg && <p className="text-xs text-gray-600 mt-2">{folderMsg}</p>}

              {caltopoFolders && caltopoFolders.length > 0 && (
                <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  {caltopoFolders.map((f, i) => (
                    <button key={f.id} type="button"
                      onClick={() => { setForm(prev => ({ ...prev, folderId: f.id })); setCaltopoFolders(null); setFolderMsg(`Selected: ${f.title || f.id}`); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${form.folderId === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                      {f.title || f.id}
                      <span className="text-xs text-gray-400 ml-2">{f.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Feature folder routing ── */}
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Feature Folder Routing</h2>
            <p className="text-sm text-gray-600 mb-4">
              Optional: enter CalTopo folder IDs to route markers and rings into named layers.
              These match the Electron app convention: <code className="text-xs bg-gray-100 px-1 rounded">00 - Critical Incident Info</code> for IPP/LKP/PLS
              and <code className="text-xs bg-gray-100 px-1 rounded">02 - LPB</code> for ISRID rings.
              Leave blank to place features in the map root.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IPP/LKP/PLS Folder ID</label>
                <input type="text" value={form.ippFolderId}
                  onChange={e => setForm(f => ({ ...f, ippFolderId: e.target.value }))}
                  placeholder="e.g. abc123 (from CalTopo folder URL)"
                  className="w-full p-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ISRID Rings Folder ID</label>
                <input type="text" value={form.ringFolderId}
                  onChange={e => setForm(f => ({ ...f, ringFolderId: e.target.value }))}
                  placeholder="e.g. def456"
                  className="w-full p-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ── Map template ── */}
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Default Map Template</h2>
            <p className="text-sm text-gray-600 mb-3">
              Upload a GeoJSON FeatureCollection — features are added to every new CalTopo map.
            </p>
            {settings.defaultGeoJSONName && (
              <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                <span>Current: <strong>{settings.defaultGeoJSONName}</strong></span>
                <span className="text-gray-500">({settings.defaultGeoJSON?.features?.length ?? 0} features)</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".geojson,.json" onChange={handleGeoJSONFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded py-3 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm">
              {settings.defaultGeoJSONName ? 'Replace GeoJSON file' : 'Choose GeoJSON file'}
            </button>
          </div>

          <button type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
