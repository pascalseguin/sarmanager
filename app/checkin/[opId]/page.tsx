'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthResult {
  personnelId: string;
  d4hMemberId: number | null;
  name: string;
  qualifications: string[];
  onCallEndsAt: string | null;
}

interface Vehicle {
  id: string;
  name: string;
  driver?: string;
  passengers: string[];
}

interface DashboardData {
  operation: { name: string; status: string; startedAt: string; departureTime: string | null };
  teamAssignment: { taskName: string; description: string; status: string; is_team_leader: number } | null;
  caltopoUrl: string | null;
  smeac: string;
  ippLat: number | null;
  ippLon: number | null;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const INSPECTION_ITEMS = [
  'Fuel level adequate',
  'Oil and fluid levels checked',
  'Tire pressure and condition OK',
  'All lights and signals operational',
  'Radio / comms equipment operational',
  'First aid kit present and accessible',
  'Fire extinguisher present',
  'GPS / navigation operational',
  'Cargo secured',
  'All passengers briefed on emergency procedures',
];

// ── Departure countdown ───────────────────────────────────────────────────────

function DepartureCountdown({ departureTime }: { departureTime: string | null }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!departureTime) return;
    function update() {
      const diff = new Date(departureTime!).getTime() - Date.now();
      if (diff <= 0) { setLabel('DEPARTED'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`Depart in ${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [departureTime]);
  if (!departureTime || !label) return null;
  const isUrgent = new Date(departureTime).getTime() - Date.now() < 10 * 60 * 1000;
  return (
    <div className={`fixed top-3 right-4 px-4 py-1.5 rounded-full text-white font-bold text-sm z-50 shadow-lg ${isUrgent ? 'bg-red-600' : 'bg-blue-600'}`}>
      ⏱ {label}
    </div>
  );
}

// ── Weather widget (inline, uses existing API) ────────────────────────────────

function WeatherWidget({ lat, lon }: { lat: number; lon: number }) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    fetch(`/api/weather?lat=${lat}&lon=${lon}`).then(r => r.json()).then(setData).catch(() => {});
  }, [lat, lon]);
  if (!data?.conditions) return <p className="text-sm text-gray-500">Loading weather…</p>;
  const c = data.conditions as Record<string, any>;
  return (
    <div className="text-sm text-gray-700">
      <span className="font-semibold">{c.description}</span>
      {c.tempC != null && ` · ${c.tempC.toFixed(1)}°C`}
      {c.windSpeedKmh != null && ` · ${c.windDirection ?? ''} ${c.windSpeedKmh} km/h`}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckInPage({ params }: { params: Promise<{ opId: string }> }) {
  const { opId } = use(params);
  const router = useRouter();

  const [opName, setOpName] = useState('');
  const [deployTimestamp, setDeployTimestamp] = useState<string | undefined>(undefined);
  const [opActive, setOpActive] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Auth
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [auth, setAuth] = useState<AuthResult | null>(null);

  // Quals
  const [qualsConfirmed, setQualsConfirmed] = useState(true);
  const [qualsNote, setQualsNote] = useState('');

  // Fitness
  const [fitForField, setFitForField] = useState(true);
  const [dropDeadTime, setDropDeadTime] = useState(() => {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return d.toTimeString().slice(0, 5);
  });

  // Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleChoice, setVehicleChoice] = useState<'driver' | 'passenger' | 'direct' | null>(null);
  const [chosenVehicle, setChosenVehicle] = useState<Vehicle | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  // Inspection
  const [inspectionChecks, setInspectionChecks] = useState<Record<string, boolean>>({});

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [copiedSmeac, setCopiedSmeac] = useState(false);

  // Check operation status on mount
  useEffect(() => {
    fetch(`/api/checkin/status/${opId}`)
      .then(r => r.json())
      .then(d => {
        setOpActive(d.active);
        setOpName(d.operationName ?? '');
        setDeployTimestamp(d.deployTimestamp ?? undefined);
      })
      .catch(() => setOpActive(false));
  }, [opId]);

  const departureTime = deployTimestamp
    ? new Date(new Date(deployTimestamp).getTime() + 45 * 60 * 1000).toISOString()
    : null;

  function getRuntimeHours() {
    const [h, m] = dropDeadTime.split(':').map(Number);
    const now = new Date();
    const ddt = new Date(now);
    ddt.setHours(h, m, 0, 0);
    if (ddt <= now) ddt.setDate(ddt.getDate() + 1);
    return (ddt.getTime() - now.getTime()) / 3600000;
  }

  const runtimeH = getRuntimeHours();
  const canDrive = fitForField && runtimeH >= 4;

  // Step 0: Auth
  async function handleAuth() {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError('All three fields are required.'); return;
    }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/checkin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), operationId: opId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Authentication failed');
      setAuth(data);
      setStep(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  // Step 2→3: Load vehicles
  async function handleFitnessNext() {
    setVehiclesLoading(true);
    setStep(3);
    try {
      const res = await fetch(`/api/checkin/vehicles?operationId=${opId}`);
      const data = await res.json();
      setVehicles(data.vehicles ?? []);
    } catch { setVehicles([]); }
    finally { setVehiclesLoading(false); }
  }

  // Vehicle claim
  async function claimVehicle(v: Vehicle, role: 'driver' | 'passenger') {
    if (!auth) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/checkin/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: role === 'driver' ? 'claim-driver' : 'claim-passenger',
          operationId: opId, vehicleId: v.id, vehicleName: v.name,
          personnelId: auth.personnelId, d4hMemberId: auth.d4hMemberId, searcherName: auth.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChosenVehicle(v);
      setVehicleChoice(role);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to claim vehicle');
    } finally {
      setBusy(false);
    }
  }

  async function handleVehicleNext() {
    if (!vehicleChoice) { setError('Choose a vehicle option.'); return; }
    await submitAttendance();
    if (vehicleChoice === 'driver') {
      setStep(4);
    } else {
      await loadDashboard();
      setStep(5);
    }
  }

  async function submitAttendance() {
    if (!auth) return;
    const [h, m] = dropDeadTime.split(':').map(Number);
    const ddt = new Date();
    ddt.setHours(h, m, 0, 0);
    if (ddt <= new Date()) ddt.setDate(ddt.getDate() + 1);
    await fetch('/api/checkin/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: opId, personnelId: auth.personnelId, d4hMemberId: auth.d4hMemberId,
        searcherName: auth.name, fitForField, dropDeadTime: ddt.toISOString(),
        qualsConfirmed, qualsNote: qualsNote.trim() || undefined,
        vehicleRole: vehicleChoice, vehicleId: chosenVehicle?.id, vehicleName: chosenVehicle?.name,
      }),
    }).catch(() => {});
  }

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/checkin/dashboard?operationId=${opId}&personnelId=${auth?.personnelId ?? ''}`);
      const data = await res.json();
      setDashboard(data);
    } catch { /* non-fatal */ }
  }, [opId, auth]);

  async function handleInspectionSubmit() {
    const checked = INSPECTION_ITEMS.filter(i => inspectionChecks[i]);
    if (checked.length < INSPECTION_ITEMS.length) {
      setError('All checklist items must be verified before proceeding.'); return;
    }
    if (!auth || !chosenVehicle) return;
    setBusy(true); setError('');
    try {
      await fetch('/api/checkin/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: chosenVehicle.id, vehicleName: chosenVehicle.name,
          d4hMemberId: auth.d4hMemberId, searcherName: auth.name,
          operationId: opId, checklistItems: checked,
        }),
      });
      await loadDashboard();
      setStep(5);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Inspection submission failed');
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (opActive === null) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;
  }
  if (!opActive) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-sm text-center">
          <p className="text-lg font-semibold text-gray-700 mb-2">Operation Not Active</p>
          <p className="text-sm text-gray-500">{opName ? `"${opName}" is not accepting check-ins.` : 'This operation is closed or does not exist.'}</p>
        </div>
      </div>
    );
  }

  const STEP_LABELS = ['ID', 'Quals', 'Fitness', 'Vehicle', 'Inspect', 'Dashboard'];

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      {step >= 2 && <DepartureCountdown departureTime={departureTime} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="font-bold text-blue-600">Searcher Check-In</span>
          <span className="text-xs text-gray-500 ml-2">{opName}</span>
        </div>
        <button onClick={() => router.push('/')} className="text-xs text-gray-500 hover:text-gray-700">✕ Exit</button>
      </div>

      {/* Step indicator */}
      {step < 5 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex gap-1 overflow-x-auto">
          {STEP_LABELS.slice(0, 5).map((lbl, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{i < step ? '✓' : i + 1}</div>
              <span className={`text-xs ${i === step ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>{lbl}</span>
              {i < 4 && <div className="w-4 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>
      )}

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
        )}

        {/* ── STEP 0: AUTH ── */}
        {step === 0 && (
          <div className="bg-white rounded-xl shadow p-5 border-l-4 border-blue-500">
            <h2 className="font-bold text-lg mb-1">Identify Yourself</h2>
            <p className="text-sm text-gray-500 mb-4">Your name and phone must match the SEASAR roster.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name"
                  className="w-full p-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Pascal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name"
                  className="w-full p-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Seguin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel"
                  className="w-full p-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="403-555-0100" />
              </div>
            </div>
            <button onClick={handleAuth} disabled={busy}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Checking roster…' : 'Find Me in Roster →'}
            </button>
          </div>
        )}

        {/* ── STEP 1: QUALS ── */}
        {step === 1 && auth && (
          <div className="bg-white rounded-xl shadow p-5 border-l-4 border-cyan-500">
            <h2 className="font-bold text-lg mb-0.5">Welcome, {auth.name}</h2>
            <p className="text-sm text-gray-500 mb-4">Review your qualifications on file.</p>
            {auth.qualifications.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {auth.qualifications.map(q => (
                  <span key={q} className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-semibold">{q}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No qualifications on file.</p>
            )}
            <label className="flex items-start gap-2.5 cursor-pointer mb-3">
              <input type="checkbox" checked={qualsConfirmed} onChange={e => setQualsConfirmed(e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 accent-blue-600" />
              <span className="text-sm">My qualifications listed above are accurate and current.</span>
            </label>
            {!qualsConfirmed && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe the inaccuracy (will be flagged to SM)</label>
                <textarea value={qualsNote} onChange={e => setQualsNote(e.target.value)} rows={3}
                  placeholder="e.g. My rope rescue cert expired last month…"
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            )}
            <button onClick={() => setStep(2)}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: FITNESS ── */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow p-5 border-l-4 border-yellow-500">
            <h2 className="font-bold text-lg mb-4">Fitness &amp; Availability</h2>
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Field Status</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: true, label: '✓ Fit for Field', active: 'border-green-500 bg-green-50 text-green-800' },
                  { val: false, label: '⚠ Base / Support Only', active: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
                ].map(({ val, label, active }) => (
                  <button key={String(val)} onClick={() => setFitForField(val)}
                    className={`p-3 rounded-lg border-2 font-semibold text-sm transition-colors ${fitForField === val ? active : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Drop-Dead Time — I must leave by:</label>
              <input type="time" value={dropDeadTime} onChange={e => setDropDeadTime(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className={`p-3 rounded-lg text-sm font-medium ${runtimeH < 4 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
              Available runtime: {Math.floor(runtimeH)}h {Math.round((runtimeH % 1) * 60)}m
              {runtimeH < 4 && ' — Driver option unavailable (< 4 hours)'}
              {!fitForField && ' — Driver option unavailable (support role)'}
            </div>
            <button onClick={handleFitnessNext}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 3: VEHICLE ── */}
        {step === 3 && (
          <div className="bg-white rounded-xl shadow p-5 border-l-4 border-cyan-500">
            <h2 className="font-bold text-lg mb-1">Vehicle Manifest</h2>
            <p className="text-sm text-gray-500 mb-4">Assign yourself to a vehicle or proceed directly to IPP.</p>
            {vehiclesLoading && <p className="text-sm text-gray-500">Loading vehicles…</p>}
            <div className="space-y-2 mb-3">
              {vehicles.map(v => {
                const hasDriver = !!v.driver;
                const isFull = v.passengers.length >= 4;
                return (
                  <div key={v.id} className={`border-2 rounded-xl p-3 transition-colors ${chosenVehicle?.id === v.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                    <div className="font-semibold text-sm mb-1">{v.name}</div>
                    <div className="text-xs text-gray-500 mb-2">
                      Driver: {v.driver ?? <em>Open</em>} · Passengers: {v.passengers.length}/4
                      {v.passengers.length > 0 && ` (${v.passengers.join(', ')})`}
                    </div>
                    <div className="flex gap-2">
                      <button disabled={hasDriver || !canDrive || busy} onClick={() => claimVehicle(v, 'driver')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        {hasDriver ? 'Driver taken' : !canDrive ? 'Driver locked' : '🚗 Claim Driver'}
                      </button>
                      <button disabled={!hasDriver || isFull || busy} onClick={() => claimVehicle(v, 'passenger')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        {isFull ? 'Full' : !hasDriver ? 'No driver yet' : '+ Passenger'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { setVehicleChoice('direct'); setChosenVehicle(null); }}
              className={`w-full p-3 rounded-xl border-2 font-bold text-sm transition-colors ${vehicleChoice === 'direct' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              📍 Attend IPP Direct (own transport)
            </button>
            <button onClick={handleVehicleNext} disabled={busy || (!vehicleChoice && !chosenVehicle)}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── STEP 4: INSPECTION ── */}
        {step === 4 && (
          <div className="bg-white rounded-xl shadow p-5 border-l-4 border-red-500">
            <h2 className="font-bold text-lg mb-0.5">Pre-Departure Vehicle Inspection</h2>
            <p className="text-sm text-gray-500 mb-1">{chosenVehicle?.name}</p>
            <p className="text-xs text-gray-400 mb-4">All items must be verified before proceeding.</p>
            <div className="space-y-2 mb-4">
              {INSPECTION_ITEMS.map(item => (
                <label key={item} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  inspectionChecks[item] ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={!!inspectionChecks[item]}
                    onChange={e => setInspectionChecks(prev => ({ ...prev, [item]: e.target.checked }))}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-green-600" />
                  <span className="text-sm">{item}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {Object.values(inspectionChecks).filter(Boolean).length}/{INSPECTION_ITEMS.length} items checked
            </p>
            <button onClick={handleInspectionSubmit} disabled={busy}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Submitting…' : 'Submit Inspection & Enter Dashboard →'}
            </button>
          </div>
        )}

        {/* ── STEP 5: DASHBOARD ── */}
        {step === 5 && auth && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
              <div className="font-bold text-base">✓ Checked In — {auth.name}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {fitForField ? 'Field Operations' : 'Base / Support'} ·{' '}
                {vehicleChoice === 'driver' ? `Driving ${chosenVehicle?.name}` :
                  vehicleChoice === 'passenger' ? `Passenger in ${chosenVehicle?.name}` : 'Direct to IPP'}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <div className="font-bold text-sm mb-2">📋 Team Assignment</div>
              {dashboard?.teamAssignment ? (
                <>
                  <div className="font-semibold">{dashboard.teamAssignment.taskName}</div>
                  {dashboard.teamAssignment.is_team_leader === 1 && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">Team Leader</span>
                  )}
                  {dashboard.teamAssignment.description && (
                    <p className="text-sm text-gray-500 mt-1">{dashboard.teamAssignment.description}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Not yet assigned to a team. Check with your SM.</p>
              )}
            </div>

            {dashboard?.caltopoUrl && (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="font-bold text-sm mb-2">🗺 Map</div>
                <a href={dashboard.caltopoUrl} target="_blank" rel="noreferrer"
                  className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                  Open CalTopo Map ↗
                </a>
              </div>
            )}

            {dashboard?.ippLat && dashboard?.ippLon && (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="font-bold text-sm mb-2">🌤 Weather at IPP</div>
                <WeatherWidget lat={dashboard.ippLat} lon={dashboard.ippLon} />
              </div>
            )}

            {dashboard?.smeac && (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm">📣 SMEAC Briefing</div>
                  <button onClick={() => { navigator.clipboard.writeText(dashboard.smeac); setCopiedSmeac(true); setTimeout(() => setCopiedSmeac(false), 2500); }}
                    className="text-xs text-blue-600 hover:underline">{copiedSmeac ? '✓ Copied' : 'Copy'}</button>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-700 leading-relaxed">{dashboard.smeac}</pre>
              </div>
            )}

            <button onClick={() => router.push('/')}
              className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
              Exit Portal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
