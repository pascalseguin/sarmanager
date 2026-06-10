'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── SAR Qualifications ────────────────────────────────────────────────────────
const SAR_QUALS = ['Ground','Medical-FR','Medical-EMT','Medical-Paramedic','Rope-Basic','Rope-Advanced',
  'Swiftwater','ATV','Snowmobile','Canine','Drone/UAS','Mountain','Navigator','Radio Op','IC','Plans','Logistics','Driver'];

// ── QR helpers ────────────────────────────────────────────────────────────────
function QRCanvas({ payload, size = 180 }: { payload: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !payload) return;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(ref.current!, payload, { width: size, margin: 2 });
    });
  }, [payload, size]);
  return <canvas ref={ref} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuthResult {
  personnelId: string; name: string; qualifications: string[];
  contact: string; onCallEndsAt: string | null; d4hMemberId: number | null;
}

interface TaskAssignment {
  id: string; name: string; task_number?: string; status: string;
  current_assignment?: string; planned_tasks?: string;
  assignments: { name: string; is_team_leader: number }[];
}

interface LocalEquipment {
  id: string; name: string; tag?: string; type?: string; container?: string;
  status: string; deployable: number;
}

export default function PortalPage() {
  const [tab, setTab] = useState<'profile' | 'team' | 'equipment'>('profile');
  const [auth, setAuth] = useState<AuthResult | null>(null);

  // Auth form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Profile edit state
  const [displayName, setDisplayName]             = useState('');
  const [editPhone, setEditPhone]                 = useState('');
  const [emergencyContact, setEmergencyContact]   = useState('');
  const [quals, setQuals]                         = useState<string[]>([]);
  const [profileSaving, setProfileSaving]         = useState(false);
  const [profileMsg, setProfileMsg]               = useState('');

  // Team state
  const [activeOps, setActiveOps]   = useState<{ id: string; name: string }[]>([]);
  const [selectedOp, setSelectedOp] = useState('');
  const [myTeam, setMyTeam]         = useState<TaskAssignment | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMsg, setTeamMsg]       = useState('');

  // Equipment state
  const [equipment, setEquipment]   = useState<LocalEquipment[]>([]);
  const [eqLoading, setEqLoading]   = useState(false);

  const qrPayload = auth ? `sar1|${displayName || auth.name}|${quals.join(',')}|${editPhone}` : '';

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true); setAuthError('');
    try {
      // We need an active operation to auth against — find first active op
      const opsRes = await fetch('/api/operations');
      const opsData = await opsRes.json();
      const activeOp = (opsData.operations ?? []).find((o: any) => o.status === 'active');
      const operationId = activeOp?.id;

      const res = await fetch('/api/checkin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, operationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Authentication failed');

      setAuth(data);
      setDisplayName(data.name);
      setEditPhone(phone);
      setQuals(data.qualifications ?? []);
      setActiveOps((opsData.operations ?? []).filter((o: any) => o.status === 'active').map((o: any) => ({ id: o.id, name: o.name })));
      if (operationId) setSelectedOp(operationId);
    } catch (e: unknown) { setAuthError(e instanceof Error ? e.message : 'Authentication failed'); }
    finally { setAuthLoading(false); }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setProfileSaving(true); setProfileMsg('');
    try {
      const res = await fetch(`/api/personnel/${auth.personnelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName.trim() || auth.name,
          phone: editPhone.trim(),
          contact: emergencyContact.trim(),
          qualifications: quals.join(', '),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setProfileMsg('Profile saved.');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (e: unknown) { setProfileMsg(e instanceof Error ? e.message : 'Save failed'); }
    finally { setProfileSaving(false); }
  }

  async function downloadQR() {
    if (!qrPayload) return;
    const QRCode = await import('qrcode');
    const url = await QRCode.toDataURL(qrPayload, { width: 400, margin: 2 });
    const a = document.createElement('a'); a.href = url;
    a.download = `${(displayName || (auth?.name ?? 'searcher')).replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.click();
  }

  const loadTeam = useCallback(async (opId: string) => {
    if (!auth || !opId) return;
    setTeamLoading(true); setTeamMsg('');
    try {
      const res = await fetch(`/api/tasks?operation_id=${opId}`);
      const data = await res.json();
      const tasks: TaskAssignment[] = data.tasks ?? [];
      const myName = (displayName || auth.name).toLowerCase();
      const assigned = tasks.find(t =>
        t.assignments.some(a => a.name.toLowerCase() === myName)
      );
      setMyTeam(assigned ?? null);
      if (!assigned) setTeamMsg('You are not assigned to a team yet for this operation.');
    } catch { setTeamMsg('Failed to load team info.'); }
    finally { setTeamLoading(false); }
  }, [auth, displayName]);

  async function loadEquipment() {
    setEqLoading(true);
    try {
      const res = await fetch('/api/equipment');
      const data = await res.json();
      setEquipment(data.equipment ?? []);
    } catch { /* non-fatal */ }
    finally { setEqLoading(false); }
  }

  useEffect(() => { if (auth && selectedOp) loadTeam(selectedOp); }, [auth, selectedOp]);
  useEffect(() => { if (auth && tab === 'equipment') loadEquipment(); }, [auth, tab]);

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!auth) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">SAR Searcher Portal</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your name and phone number to continue.</p>
          <form onSubmit={handleAuth} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                <input required value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
              <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="403-555-0100"
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" disabled={authLoading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {authLoading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-gray-900">SAR Searcher Portal</div>
          <div className="text-xs text-gray-500">{auth.name}</div>
        </div>
        <div className="flex items-center gap-3">
          {auth.onCallEndsAt && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              ON-CALL until {new Date(auth.onCallEndsAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => setAuth(null)} className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b flex">
        {([
          { id: 'profile', label: 'My Profile' },
          { id: 'team',    label: myTeam ? `My Team — ${myTeam.name}` : 'My Team' },
          { id: 'equipment', label: 'Equipment' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="font-semibold text-gray-800 mb-4">My Profile</h2>
              <form onSubmit={saveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Contact</label>
                  <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                    placeholder="Name and phone number"
                    className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Qualifications</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SAR_QUALS.map(q => {
                      const on = quals.includes(q);
                      return (
                        <button key={q} type="button" onClick={() => setQuals(prev => on ? prev.filter(x => x !== q) : [...prev, q])}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {profileMsg && <p className={`text-sm ${profileMsg.includes('failed') || profileMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{profileMsg}</p>}
                <button type="submit" disabled={profileSaving}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {profileSaving ? 'Saving…' : 'Save Profile'}
                </button>
              </form>
            </div>

            {/* QR Card */}
            <div className="bg-white rounded-xl shadow p-5 flex flex-col items-center">
              <h2 className="font-semibold text-gray-800 mb-4 self-start">My QR Card</h2>
              <div className="bg-white p-4 rounded-xl shadow-md border text-center mb-3">
                <QRCanvas payload={qrPayload} size={160} />
                <div className="font-bold text-gray-900 mt-2 text-sm">{displayName || auth.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{quals.join(' · ') || 'No quals set'}</div>
              </div>
              <button onClick={downloadQR}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Download PNG
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center max-w-48">
                Show to the Search Manager to check in via QR scan
              </p>
            </div>
          </div>
        )}

        {/* ── Team tab ── */}
        {tab === 'team' && (
          <div className="space-y-4">
            {activeOps.length > 1 && (
              <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Active Operation:</label>
                <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)}
                  className="flex-1 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {activeOps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button onClick={() => loadTeam(selectedOp)} className="text-xs text-blue-500 hover:underline">Refresh</button>
              </div>
            )}

            {teamLoading && <div className="text-center text-gray-500 py-8">Loading team assignment…</div>}
            {teamMsg && !myTeam && (
              <div className="bg-white rounded-xl shadow p-6 text-center">
                <p className="text-gray-500 text-sm">{teamMsg}</p>
                <p className="text-xs text-gray-400 mt-2">The Search Manager assigns teams from the Operations board. Check back after teams are built.</p>
                <button onClick={() => loadTeam(selectedOp)} className="mt-3 text-sm text-blue-600 hover:underline">Refresh</button>
              </div>
            )}

            {myTeam && !teamLoading && (
              <div className="bg-white rounded-xl shadow p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-xl text-gray-900">{myTeam.name}</h2>
                  <div className="flex items-center gap-2">
                    {myTeam.task_number && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{myTeam.task_number}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${myTeam.status === 'deployed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {myTeam.status}
                    </span>
                    <button onClick={() => loadTeam(selectedOp)} className="text-xs text-gray-400 hover:underline">↺</button>
                  </div>
                </div>

                {myTeam.current_assignment && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Current Assignment</div>
                    <div className="text-sm font-semibold text-blue-900">{myTeam.current_assignment}</div>
                  </div>
                )}

                {myTeam.planned_tasks && (
                  <div className="mb-4">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Planned Assignments</div>
                    <div className="text-sm text-gray-700">{myTeam.planned_tasks}</div>
                  </div>
                )}

                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Team Members ({myTeam.assignments.length})</div>
                  <div className="space-y-1">
                    {myTeam.assignments.map(a => (
                      <div key={a.name} className="flex items-center gap-2 text-sm">
                        {a.is_team_leader ? <span className="text-yellow-500">★</span> : <span className="w-3" />}
                        <span className={a.name.toLowerCase() === (displayName || auth.name).toLowerCase() ? 'font-bold text-blue-700' : 'text-gray-800'}>{a.name}</span>
                        {a.is_team_leader && <span className="text-xs text-yellow-600">Team Lead</span>}
                        {a.name.toLowerCase() === (displayName || auth.name).toLowerCase() && <span className="text-xs text-blue-600">(you)</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-700">
                    Radio check every 60 minutes. Report to SM before entry and on exit from search area. Emergency: No Duff.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Equipment tab ── */}
        {tab === 'equipment' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Equipment Registry</h2>
                <button onClick={loadEquipment} disabled={eqLoading} className="text-xs text-blue-500 hover:underline">
                  {eqLoading ? '…' : '↺ Refresh'}
                </button>
              </div>
              {eqLoading && <p className="text-sm text-gray-500">Loading equipment…</p>}
              {!eqLoading && equipment.length === 0 && (
                <p className="text-sm text-gray-500">No equipment in the registry. The Search Manager manages equipment from the Equipment page.</p>
              )}
              {!eqLoading && equipment.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left hidden sm:table-cell">Type</th>
                        <th className="px-3 py-2 text-left hidden md:table-cell">Container</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipment.map((item, i) => (
                        <tr key={item.id} className={`${i > 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50`}>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {item.name}
                            {item.tag && <span className="ml-1 text-xs text-gray-400 font-mono">{item.tag}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{item.type ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500 hidden md:table-cell">{item.container ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${item.status === 'available' ? 'bg-green-100 text-green-700' : item.status === 'deployed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
