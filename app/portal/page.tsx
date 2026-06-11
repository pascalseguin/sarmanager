'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

function WeatherWidget({ lat, lon }: { lat: number; lon: number }) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    fetch(`/api/weather?lat=${lat}&lon=${lon}`).then(r => r.json()).then(setData).catch(() => {});
  }, [lat, lon]);
  if (!data?.conditions) return <p style={{ fontSize: 13, color: '#6b7280' }}>Loading weather…</p>;
  const c = data.conditions as Record<string, any>;
  return (
    <p style={{ fontSize: 13, color: '#374151' }}>
      <strong>{c.description}</strong>
      {c.tempC != null && ` · ${c.tempC.toFixed(1)}°C`}
      {c.windSpeedKmh != null && ` · ${c.windDirection ?? ''} ${c.windSpeedKmh} km/h`}
    </p>
  );
}

interface AuthResult {
  personnelId: string; name: string; qualifications: string[];
  contact: string; onCallEndsAt: string | null; d4hMemberId: number | null;
}

interface DashboardData {
  operation: { name: string; status: string; startedAt: string; departureTime: string | null };
  teamAssignment: { taskName: string; description: string; status: string; is_team_leader: number } | null;
  caltopoUrl: string | null;
  smeac: string;
  ippLat: number | null;
  ippLon: number | null;
}

interface LocalEquipment {
  id: string; name: string; tag?: string; type?: string; container?: string;
  status: string; deployable: number;
}

export default function PortalPage() {
  const [tab, setTab] = useState<'profile' | 'team' | 'equipment'>('profile');
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [allQuals, setAllQuals] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/quals').then(r => r.json()).then(d => setAllQuals(d.all ?? [])).catch(() => {});
  }, []);

  // Auth form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Profile
  const [displayName, setDisplayName]           = useState('');
  const [editPhone, setEditPhone]               = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [quals, setQuals]                       = useState<string[]>([]);
  const [profileSaving, setProfileSaving]       = useState(false);
  const [profileMsg, setProfileMsg]             = useState('');

  // Team / dashboard
  const [activeOps, setActiveOps]         = useState<{ id: string; name: string }[]>([]);
  const [selectedOp, setSelectedOp]       = useState('');
  const [dashboard, setDashboard]         = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading]     = useState(false);
  const [dashMsg, setDashMsg]             = useState('');
  const [copiedSmeac, setCopiedSmeac]     = useState(false);

  // Equipment
  const [equipment, setEquipment] = useState<LocalEquipment[]>([]);
  const [eqLoading, setEqLoading] = useState(false);

  const qrPayload = auth ? `sar1|${displayName || auth.name}|${quals.join(',')}|${editPhone}` : '';

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true); setAuthError('');
    try {
      const opsRes = await fetch('/api/operations');
      const opsData = await opsRes.json();
      const ops = (opsData.operations ?? []).filter((o: any) => o.status === 'active');
      const activeOp = ops[0];

      const res = await fetch('/api/checkin/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, operationId: activeOp?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Authentication failed');
      setAuth(data);
      setDisplayName(data.name);
      setEditPhone(phone);
      setQuals(data.qualifications ?? []);
      setActiveOps(ops.map((o: any) => ({ id: o.id, name: o.name })));
      if (activeOp) setSelectedOp(activeOp.id);
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setProfileSaving(true); setProfileMsg('');
    try {
      const res = await fetch(`/api/personnel/${auth.personnelId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName.trim() || auth.name, phone: editPhone.trim(), contact: emergencyContact.trim(), qualifications: quals.join(', ') }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setProfileMsg('Profile saved.');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setProfileSaving(false);
    }
  }

  async function downloadQR() {
    if (!qrPayload) return;
    const QRCode = await import('qrcode');
    const url = await QRCode.toDataURL(qrPayload, { width: 400, margin: 2 });
    const a = document.createElement('a'); a.href = url;
    a.download = `${(displayName || (auth?.name ?? 'searcher')).replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.click();
  }

  const loadDashboard = useCallback(async (opId: string) => {
    if (!auth || !opId) return;
    setDashLoading(true); setDashMsg('');
    try {
      const res = await fetch(`/api/checkin/dashboard?operationId=${opId}&personnelId=${auth.personnelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setDashboard(data);
      if (!data.teamAssignment) setDashMsg('You are not assigned to a team yet. Check with the SM.');
    } catch (e: unknown) {
      setDashMsg(e instanceof Error ? e.message : 'Failed to load team info.');
    } finally {
      setDashLoading(false);
    }
  }, [auth]);

  async function loadEquipment() {
    setEqLoading(true);
    try {
      const res = await fetch('/api/equipment');
      const data = await res.json();
      setEquipment(data.equipment ?? []);
    } catch { /* non-fatal */ }
    finally { setEqLoading(false); }
  }

  useEffect(() => { if (auth && selectedOp) loadDashboard(selectedOp); }, [auth, selectedOp]);
  useEffect(() => { if (auth && tab === 'equipment') loadEquipment(); }, [auth, tab]);

  // ── Styles (light theme — public-facing mobile page) ─────────────────────
  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 20, marginBottom: 0 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const btnPrimary: React.CSSProperties = { width: '100%', padding: '12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' };

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ ...card, width: '100%', maxWidth: 360, padding: '36px 32px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 4 }}>SAR Searcher Portal</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Enter your name and phone number to continue.</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input required value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input required value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="403-555-0100" autoComplete="tel" style={inputStyle} />
            </div>
            {authError && <p style={{ fontSize: 13, color: '#dc2626' }}>{authError}</p>}
            <button type="submit" disabled={authLoading} style={{ ...btnPrimary, opacity: authLoading ? 0.6 : 1 }}>
              {authLoading ? 'Authenticating…' : 'Sign In →'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const teamName = dashboard?.teamAssignment?.taskName;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>SAR Searcher Portal</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{auth.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {auth.onCallEndsAt && (
            <span style={{ fontSize: 11, background: '#d1fae5', color: '#065f46', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              ON-CALL until {new Date(auth.onCallEndsAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => setAuth(null)} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex' }}>
        {([
          { id: 'profile',   label: 'My Profile' },
          { id: 'team',      label: teamName ? `Team — ${teamName}` : 'My Team' },
          { id: 'equipment', label: 'Equipment' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, border: 'none', borderBottom: `2px solid ${tab === t.id ? '#2563eb' : 'transparent'}`, color: tab === t.id ? '#2563eb' : '#6b7280', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 16px 40px' }}>

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            <div style={card}>
              <h2 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#111827' }}>My Profile</h2>
              <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Display Name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Emergency Contact</label>
                  <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="Name and phone" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Qualifications</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {allQuals.map(q => {
                      const on = quals.includes(q);
                      return (
                        <button key={q} type="button" onClick={() => setQuals(prev => on ? prev.filter(x => x !== q) : [...prev, q])}
                          style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, border: `1px solid ${on ? '#2563eb' : '#d1d5db'}`, background: on ? '#dbeafe' : 'transparent', color: on ? '#1d4ed8' : '#6b7280', cursor: 'pointer' }}>
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {profileMsg && (
                  <p style={{ fontSize: 13, color: profileMsg.includes('fail') || profileMsg.includes('Fail') ? '#dc2626' : '#059669' }}>{profileMsg}</p>
                )}
                <button type="submit" disabled={profileSaving} style={{ ...btnPrimary, opacity: profileSaving ? 0.6 : 1 }}>
                  {profileSaving ? 'Saving…' : 'Save Profile'}
                </button>
              </form>
            </div>

            {/* QR Card */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#111827', alignSelf: 'flex-start' }}>My QR Card</h2>
              <div style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', textAlign: 'center', marginBottom: 12 }}>
                <QRCanvas payload={qrPayload} size={160} />
                <div style={{ fontWeight: 700, color: '#111827', marginTop: 8, fontSize: 14 }}>{displayName || auth.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{quals.join(' · ') || 'No quals set'}</div>
              </div>
              <button onClick={downloadQR}
                style={{ padding: '8px 20px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer' }}>
                Download PNG
              </button>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center', maxWidth: 200 }}>
                Show to the Search Manager to check in via QR scan
              </p>
            </div>
          </div>
        )}

        {/* ── Team tab ── */}
        {tab === 'team' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeOps.length > 1 && (
              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Operation:</label>
                  <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    {activeOps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button onClick={() => loadDashboard(selectedOp)} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>↺</button>
                </div>
              </div>
            )}

            {dashLoading && <p style={{ textAlign: 'center', color: '#6b7280', padding: '32px 0', fontSize: 13 }}>Loading…</p>}

            {!dashLoading && dashMsg && !dashboard?.teamAssignment && (
              <div style={card}>
                <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>{dashMsg}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>The SM assigns teams from the Operations board. Check back after teams are built.</p>
                <button onClick={() => loadDashboard(selectedOp)} style={{ display: 'block', margin: '10px auto 0', fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>↺ Refresh</button>
              </div>
            )}

            {!dashLoading && dashboard && (
              <>
                {/* Team assignment */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6b7280', marginBottom: 8 }}>Team Assignment</div>
                  {dashboard.teamAssignment ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>{dashboard.teamAssignment.taskName}</span>
                        {dashboard.teamAssignment.is_team_leader === 1 && (
                          <span style={{ fontSize: 11, background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>Team Leader</span>
                        )}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: dashboard.teamAssignment.status === 'deployed' ? '#d1fae5' : '#fef3c7', color: dashboard.teamAssignment.status === 'deployed' ? '#065f46' : '#92400e' }}>
                          {dashboard.teamAssignment.status}
                        </span>
                      </div>
                      {dashboard.teamAssignment.description && (
                        <p style={{ fontSize: 13, color: '#374151' }}>{dashboard.teamAssignment.description}</p>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: '#6b7280' }}>Not yet assigned to a team. Check with your SM.</p>
                  )}
                </div>

                {/* CalTopo */}
                {dashboard.caltopoUrl && (
                  <div style={card}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6b7280', marginBottom: 8 }}>🗺 Map</div>
                    <a href={dashboard.caltopoUrl} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', padding: '8px 18px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      Open CalTopo Map ↗
                    </a>
                  </div>
                )}

                {/* Weather */}
                {dashboard.ippLat != null && dashboard.ippLon != null && (
                  <div style={card}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6b7280', marginBottom: 8 }}>🌤 Weather at IPP</div>
                    <WeatherWidget lat={dashboard.ippLat} lon={dashboard.ippLon} />
                  </div>
                )}

                {/* SMEAC */}
                {dashboard.smeac && (
                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6b7280' }}>📣 SMEAC Briefing</div>
                      <button onClick={() => { navigator.clipboard.writeText(dashboard.smeac); setCopiedSmeac(true); setTimeout(() => setCopiedSmeac(false), 2500); }}
                        style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {copiedSmeac ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#374151', lineHeight: 1.5, margin: 0 }}>{dashboard.smeac}</pre>
                  </div>
                )}

                {/* Safety reminder */}
                <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', margin: 0 }}>
                    Radio check every 60 minutes. Report to SM before entry and on exit from search area. Emergency: No Duff.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Equipment tab ── */}
        {tab === 'equipment' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Equipment Registry</h2>
              <button onClick={loadEquipment} disabled={eqLoading} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                {eqLoading ? '…' : '↺ Refresh'}
              </button>
            </div>
            {eqLoading && <p style={{ fontSize: 13, color: '#6b7280' }}>Loading…</p>}
            {!eqLoading && equipment.length === 0 && (
              <p style={{ fontSize: 13, color: '#6b7280' }}>No equipment in the registry.</p>
            )}
            {!eqLoading && equipment.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((item, i) => (
                    <tr key={item.id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 500, color: '#111827' }}>
                        {item.name}
                        {item.tag && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{item.tag}</span>}
                      </td>
                      <td style={{ padding: '8px 8px', color: '#6b7280' }}>{item.type ?? '—'}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: item.status === 'available' ? '#d1fae5' : item.status === 'deployed' ? '#dbeafe' : '#f3f4f6', color: item.status === 'available' ? '#065f46' : item.status === 'deployed' ? '#1d4ed8' : '#6b7280' }}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
