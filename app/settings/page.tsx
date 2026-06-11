'use client';

import { useState, useRef } from 'react';
import { useSettings } from '@/lib/settings-context';
import { useQuals, invalidateQuals } from '@/lib/useQuals';

const ALL_LPB_PCTS = [25, 50, 75, 95];

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { d4h: d4hQuals, extra: extraQuals, loading: qualsLoading } = useQuals();
  const [newQual, setNewQual] = useState('');
  const [qualSyncing, setQualSyncing] = useState(false);
  const [qualMsg, setQualMsg] = useState('');

  const [form, setForm] = useState({
    credentialId:     settings.credentialId,
    secret:           settings.secret,
    accountId:        settings.accountId,
    folderId:         settings.folderId,
    ippFolderId:      settings.ippFolderId ?? '',
    ringFolderId:     settings.ringFolderId ?? '',
    d4hToken:         settings.d4hToken,
    d4hTeamId:        settings.d4hTeamId,
    d4hTeamName:      settings.d4hTeamName,
    hereApiKey:       settings.hereApiKey,
    opNameTemplate:   settings.opNameTemplate ?? '{location}-{date}-{d4h_id}',
    orgName:          settings.orgName ?? 'SEASAR',
    orgFullName:      settings.orgFullName ?? 'South Eastern Alberta Search & Rescue',
    taskingAgencies:  (settings.taskingAgencies ?? ['RCMP', 'MHPS', 'AHS', 'STARS', 'CJFR', 'Other']) as string[],
    lpbRingPcts:      (settings.lpbRingPcts ?? [50, 75, 95]) as number[],
    twilioAccountSid: settings.twilioAccountSid ?? '',
    twilioAuthToken:  settings.twilioAuthToken ?? '',
    twilioFromNumber: settings.twilioFromNumber ?? '',
  });

  const [saved, setSaved]           = useState(false);
  const [newAgency, setNewAgency]   = useState('');
  const fileRef                     = useRef<HTMLInputElement>(null);
  const [d4hTest, setD4hTest]       = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; msg: string }>({ status: 'idle', msg: '' });
  const [d4hTeams, setD4hTeams]     = useState<{ id: number; name: string; logo?: string | null }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [caltopoFolders, setCaltopoFolders]         = useState<{ id: string; title: string }[] | null>(null);
  const [discoveringFolders, setDiscoveringFolders] = useState(false);
  const [newFolderName, setNewFolderName]           = useState('SAR Operations');
  const [creatingFolder, setCreatingFolder]         = useState(false);
  const [folderMsg, setFolderMsg]                   = useState('');
  const [caltopoTest, setCaltopoTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; msg: string }>({ status: 'idle', msg: '' });

  async function syncD4HQuals() {
    if (!settings.d4hToken || !settings.d4hTeamId) { setQualMsg('D4H token and team ID required.'); return; }
    setQualSyncing(true); setQualMsg('');
    try {
      const res = await fetch('/api/quals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', token: settings.d4hToken, teamId: Number(settings.d4hTeamId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      invalidateQuals();
      setQualMsg(`Synced ${data.d4h?.length ?? 0} from D4H.`);
    } catch (e: unknown) {
      setQualMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setQualSyncing(false);
      setTimeout(() => setQualMsg(''), 4000);
    }
  }

  async function addExtraQual() {
    const name = newQual.trim();
    if (!name) return;
    await fetch('/api/quals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    setNewQual(''); invalidateQuals();
  }

  async function removeExtraQual(name: string) {
    await fetch('/api/quals', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    invalidateQuals();
  }

  async function testD4H() {
    const token = form.d4hToken.trim();
    if (!token) { setD4hTest({ status: 'error', msg: 'Enter a token first' }); return; }
    setD4hTest({ status: 'testing', msg: '' });
    try {
      const res = await fetch('/api/d4h', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'testConnection', token }) });
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
      const res = await fetch('/api/d4h', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getTeams', token }) });
      const data = await res.json();
      setD4hTeams(data.teams ?? []);
    } catch { /* ignore */ }
    finally { setLoadingTeams(false); }
  }

  async function testCalTopo() {
    if (!form.credentialId || !form.secret || !form.accountId) { setCaltopoTest({ status: 'error', msg: 'Fill in Team ID, Credential ID, and Secret first' }); return; }
    setCaltopoTest({ status: 'testing', msg: '' });
    try {
      const res = await fetch('/api/caltopo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testCredentials', credentialId: form.credentialId, secret: form.secret, accountId: form.accountId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCaltopoTest({ status: 'ok', msg: `✓ Read + write confirmed — account: ${data.accountId}` });
    } catch (e: unknown) {
      setCaltopoTest({ status: 'error', msg: e instanceof Error ? e.message : 'Test failed' });
    }
  }

  async function discoverFolders() {
    if (!form.credentialId || !form.secret || !form.accountId) { setFolderMsg('Save CalTopo credentials first.'); return; }
    setDiscoveringFolders(true); setFolderMsg(''); setCaltopoFolders(null);
    try {
      const res = await fetch('/api/caltopo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discoverFolders', credentialId: form.credentialId, secret: form.secret, accountId: form.accountId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.folders?.length) setFolderMsg('No folders found — create one below.');
      else setCaltopoFolders(data.folders);
    } catch (e: unknown) {
      setFolderMsg(e instanceof Error ? e.message : 'Discovery failed');
    } finally { setDiscoveringFolders(false); }
  }

  async function createFolder() {
    if (!form.credentialId || !form.secret || !form.accountId) { setFolderMsg('Save CalTopo credentials first.'); return; }
    setCreatingFolder(true); setFolderMsg('');
    try {
      const res = await fetch('/api/caltopo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', credentialId: form.credentialId, secret: form.secret, accountId: form.accountId, title: newFolderName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(f => ({ ...f, folderId: data.folderId }));
      setFolderMsg(`"${data.title}" created — ID saved.`);
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

  function addAgency() {
    const v = newAgency.trim();
    if (!v || form.taskingAgencies.includes(v)) return;
    setForm(f => ({ ...f, taskingAgencies: [...f.taskingAgencies, v] }));
    setNewAgency('');
  }

  function removeAgency(a: string) {
    setForm(f => ({ ...f, taskingAgencies: f.taskingAgencies.filter(x => x !== a) }));
  }

  function toggleLPBPct(pct: number) {
    setForm(f => ({
      ...f,
      lpbRingPcts: f.lpbRingPcts.includes(pct)
        ? f.lpbRingPcts.filter(p => p !== pct)
        : [...f.lpbRingPcts, pct].sort((a, b) => a - b),
    }));
  }

  return (
    <div className="app-content">
      <form onSubmit={handleSave}>

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <h1 className="text-base font-bold text-gray-900">Settings</h1>
            <button type="submit"
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 py-4">
          {/* 3-column grid: left (integrations), center (D4H + quals), right (CalTopo) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

            {/* ══ COLUMN 1: Org + Integrations + Presets ══ */}
            <div className="space-y-4">

              {/* Organization */}
              <Card title="Organization">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Short name" hint="Nav bar & printed forms">
                    <input type="text" value={form.orgName}
                      onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))}
                      placeholder="SEASAR" className={inputCls} />
                  </Field>
                  <Field label="Full name" hint="Home & login screens">
                    <input type="text" value={form.orgFullName}
                      onChange={e => setForm(f => ({ ...f, orgFullName: e.target.value }))}
                      placeholder="South Eastern Alberta Search & Rescue" className={inputCls} />
                  </Field>
                </div>
              </Card>

              {/* HERE Geocoding */}
              <Card title="HERE Geocoding">
                <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                  Free at{' '}
                  <a href="https://developer.here.com/sign-up" target="_blank" rel="noreferrer" className="underline font-medium">developer.here.com/sign-up</a>
                  {' '}— no credit card needed.
                </p>
                <Field label="HERE API Key">
                  <input type="password" value={form.hereApiKey}
                    onChange={e => setForm(f => ({ ...f, hereApiKey: e.target.value }))}
                    className={inputCls} />
                </Field>
              </Card>

              {/* Twilio */}
              <Card title="Twilio (SMS & Voice)">
                <div className="space-y-3">
                  <Field label="Account SID">
                    <input type="password" value={form.twilioAccountSid}
                      onChange={e => setForm(f => ({ ...f, twilioAccountSid: e.target.value }))}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={inputCls} />
                  </Field>
                  <Field label="Auth Token">
                    <input type="password" value={form.twilioAuthToken}
                      onChange={e => setForm(f => ({ ...f, twilioAuthToken: e.target.value }))}
                      className={inputCls} />
                  </Field>
                  <Field label="From Number" hint="Phone numbers must be in your roster to receive messages.">
                    <input type="text" value={form.twilioFromNumber}
                      onChange={e => setForm(f => ({ ...f, twilioFromNumber: e.target.value }))}
                      placeholder="+14035550100" className={inputCls} />
                  </Field>
                </div>
              </Card>

              {/* Operational Presets */}
              <Card title="Operational Presets">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1.5">Tasking Agencies</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {form.taskingAgencies.map(a => (
                        <span key={a} className="flex items-center gap-0.5 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs font-medium">
                          {a}
                          <button type="button" onClick={() => removeAgency(a)} className="text-blue-400 hover:text-blue-700 ml-0.5">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newAgency} onChange={e => setNewAgency(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgency(); } }}
                        placeholder="Add agency…"
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={addAgency}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-sm font-medium transition-colors">+ Add</button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1.5">LPB Probability Rings</p>
                    <div className="flex gap-2">
                      {ALL_LPB_PCTS.map(pct => {
                        const on = form.lpbRingPcts.includes(pct);
                        const colors: Record<number, string> = { 25: 'bg-red-100 border-red-400 text-red-700', 50: 'bg-orange-100 border-orange-400 text-orange-700', 75: 'bg-yellow-100 border-yellow-400 text-yellow-700', 95: 'bg-green-100 border-green-400 text-green-700' };
                        return (
                          <button key={pct} type="button" onClick={() => toggleLPBPct(pct)}
                            className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-colors ${on ? colors[pct] : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'}`}>
                            {pct}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Op Naming */}
              <Card title="Operation Naming">
                <div className="space-y-2">
                  <Field label="Name template">
                    <input value={form.opNameTemplate}
                      onChange={e => setForm(f => ({ ...f, opNameTemplate: e.target.value }))}
                      placeholder="{location}-{date}-{d4h_id}"
                      className={`${inputCls} font-mono`} />
                  </Field>
                  <div className="flex flex-wrap gap-1">
                    {([
                      ['{location}', 'PLS location'], ['{date}', 'YYYY-MM-DD'],
                      ['{d4h_id}', 'D4H incident #'], ['{subject}', 'Subject name'],
                    ] as [string, string][]).map(([token, desc]) => (
                      <button key={token} type="button"
                        onClick={() => setForm(f => ({ ...f, opNameTemplate: f.opNameTemplate + token }))}
                        title={desc}
                        className="px-2 py-0.5 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-700 rounded text-xs font-mono border border-gray-200 transition-colors">
                        {token}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Preview: <span className="font-mono text-gray-600">{
                      form.opNameTemplate
                        .replace('{location}', 'Maple Ridge')
                        .replace('{date}', new Date().toISOString().slice(0, 10))
                        .replace('{d4h_id}', '4521')
                        .replace('{subject}', 'John Doe')
                    }</span>
                  </p>
                </div>
              </Card>

            </div>

            {/* ══ COLUMN 2: D4H + Qualifications ══ */}
            <div className="space-y-4">

              {/* D4H Team Manager */}
              <Card title="D4H Team Manager">
                <div className="space-y-3">
                  <Field label="API Token" hint="D4H Team Manager → Account → Manage Personal Access Tokens">
                    <input type="password" value={form.d4hToken}
                      onChange={e => setForm(f => ({ ...f, d4hToken: e.target.value }))}
                      className={inputCls} />
                  </Field>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={testD4H} disabled={d4hTest.status === 'testing'}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {d4hTest.status === 'testing' ? 'Testing…' : 'Test Connection'}
                    </button>
                    <button type="button" onClick={loadTeams} disabled={loadingTeams}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {loadingTeams ? 'Loading…' : 'Load Teams →'}
                    </button>
                    {d4hTest.status === 'ok'    && <span className="text-xs text-green-700 font-medium">✓ {d4hTest.msg}</span>}
                    {d4hTest.status === 'error' && <span className="text-xs text-red-600">{d4hTest.msg}</span>}
                  </div>

                  {/* Active team summary */}
                  {d4hTeams.length === 0 && form.d4hTeamName && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                      <div>
                        <p className="text-sm font-semibold text-green-800">{form.d4hTeamName}</p>
                        <p className="text-xs text-green-600">ID {form.d4hTeamId} — click "Load Teams →" to change</p>
                      </div>
                    </div>
                  )}

                  {/* Team cards */}
                  {d4hTeams.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1.5">Select Active Team</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {d4hTeams.map(t => {
                          const active = String(t.id) === form.d4hTeamId;
                          return (
                            <button key={t.id} type="button"
                              onClick={() => setForm(f => ({ ...f, d4hTeamId: String(t.id), d4hTeamName: t.name }))}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-left transition-colors ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                              {t.logo
                                ? <img src={t.logo} alt="" className="w-7 h-7 rounded object-contain shrink-0 border border-gray-200" />
                                : <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{t.name.slice(0, 2).toUpperCase()}</div>
                              }
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-semibold truncate ${active ? 'text-blue-700' : 'text-gray-800'}`}>{t.name}</div>
                                <div className="text-xs text-gray-400">ID {t.id}</div>
                              </div>
                              {active && <span className="text-xs font-medium text-blue-600 shrink-0">Active</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Qualifications */}
              <Card title="Qualifications"
                action={
                  <button type="button" onClick={syncD4HQuals} disabled={qualSyncing || !settings.d4hToken}
                    className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    {qualSyncing ? 'Syncing…' : '↺ Sync from D4H'}
                  </button>
                }>
                <div className="space-y-3">
                  {qualMsg && <p className={`text-xs ${qualMsg.includes('fail') || qualMsg.includes('required') ? 'text-red-600' : 'text-green-700'}`}>{qualMsg}</p>}

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From D4H ({d4hQuals.length})</p>
                    {qualsLoading && <p className="text-xs text-gray-400">Loading…</p>}
                    {!qualsLoading && d4hQuals.length === 0 && (
                      <p className="text-xs text-gray-400">None synced yet — click Sync from D4H.</p>
                    )}
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {d4hQuals.map(q => (
                        <span key={q} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">{q}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Extra (local supplements)</p>
                    <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
                      {extraQuals.length === 0 && <p className="text-xs text-gray-400">None added.</p>}
                      {extraQuals.map(q => (
                        <span key={q} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          {q}
                          <button type="button" onClick={() => removeExtraQual(q)}
                            style={{ lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13, padding: 0 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newQual} onChange={e => setNewQual(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExtraQual())}
                        placeholder="e.g. Swiftwater-Advanced"
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={addExtraQual} disabled={!newQual.trim()}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

            </div>

            {/* ══ COLUMN 3: CalTopo (all merged) ══ */}
            <div className="space-y-4">

              {/* CalTopo — all settings in one card */}
              <Card title="CalTopo Service Account">
                <div className="space-y-3">
                  <Field label="Team ID" hint="caltopo.com/team/XXXXXX/admin">
                    <input type="text" value={form.accountId}
                      onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                      placeholder="e.g. AJ1C1D" className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Credential ID">
                      <input type="text" value={form.credentialId}
                        onChange={e => setForm(f => ({ ...f, credentialId: e.target.value }))}
                        className={inputCls} />
                    </Field>
                    <Field label="Credential Secret">
                      <input type="password" value={form.secret}
                        onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                        placeholder="Base64 secret" className={inputCls} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={testCalTopo} disabled={caltopoTest.status === 'testing'}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {caltopoTest.status === 'testing' ? 'Testing…' : 'Test Credentials'}
                    </button>
                    {caltopoTest.status === 'ok'    && <span className="text-xs text-green-700 font-medium">{caltopoTest.msg}</span>}
                    {caltopoTest.status === 'error' && <span className="text-xs text-red-600">{caltopoTest.msg}</span>}
                  </div>
                </div>
              </Card>

              {/* Operations Folder */}
              <Card title="Operations Folder">
                <div className="space-y-2">
                  <Field label="Folder ID" hint="New maps will be placed in this folder">
                    <input type="text" value={form.folderId}
                      onChange={e => setForm(f => ({ ...f, folderId: e.target.value }))}
                      placeholder="e.g. abc123" className={inputCls} />
                  </Field>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button type="button" onClick={discoverFolders} disabled={discoveringFolders}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {discoveringFolders ? 'Searching…' : '↓ Browse folders'}
                    </button>
                    <span className="text-xs text-gray-400">or create:</span>
                    <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg w-32 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button type="button" onClick={createFolder} disabled={creatingFolder}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {creatingFolder ? 'Creating…' : '+ Create'}
                    </button>
                  </div>
                  {folderMsg && <p className="text-xs text-gray-600">{folderMsg}</p>}
                  {caltopoFolders && caltopoFolders.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      {caltopoFolders.map((f, i) => (
                        <button key={f.id} type="button"
                          onClick={() => { setForm(prev => ({ ...prev, folderId: f.id })); setCaltopoFolders(null); setFolderMsg(`Selected: ${f.title || f.id}`); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${form.folderId === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                          {f.title || f.id}
                          <span className="text-gray-400 ml-2">{f.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Feature Folder Routing */}
              <Card title="Feature Folder Routing">
                <p className="text-xs text-gray-500 mb-3">
                  Route markers and rings into named CalTopo layers.{' '}
                  <code className="bg-gray-100 px-1 rounded">00 - Critical Incident Info</code> for IPP/LKP/PLS,{' '}
                  <code className="bg-gray-100 px-1 rounded">02 - LPB</code> for ISRID rings. Leave blank for map root.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="IPP / LKP / PLS Folder ID">
                    <input type="text" value={form.ippFolderId}
                      onChange={e => setForm(f => ({ ...f, ippFolderId: e.target.value }))}
                      placeholder="e.g. abc123"
                      className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="ISRID Rings Folder ID">
                    <input type="text" value={form.ringFolderId}
                      onChange={e => setForm(f => ({ ...f, ringFolderId: e.target.value }))}
                      placeholder="e.g. def456"
                      className={`${inputCls} font-mono`} />
                  </Field>
                </div>
              </Card>

              {/* Default Map Template */}
              <Card title="Default Map Template">
                <p className="text-xs text-gray-500 mb-3">
                  Upload a GeoJSON FeatureCollection — its features are added to every new CalTopo map.
                </p>
                {settings.defaultGeoJSONName && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span>Current: <strong>{settings.defaultGeoJSONName}</strong></span>
                    <span className="text-gray-500">({settings.defaultGeoJSON?.features?.length ?? 0} features)</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".geojson,.json" onChange={handleGeoJSONFile} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                  {settings.defaultGeoJSONName ? '↑ Replace GeoJSON file' : '↑ Choose GeoJSON file'}
                </button>
              </Card>

            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
