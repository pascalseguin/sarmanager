'use client';

import { useState, useEffect } from 'react';
import { operationsStore, Operation } from '@/lib/operations-store';
import { parseUTMString, formatUTM } from '@/lib/utm';
import { ISRID } from '@/lib/isrid';
import { useSettings } from '@/lib/settings-context';

// ── Equipment preset helpers ──────────────────────────────────────────────────

const PRESETS_KEY = 'sarmanager_eq_presets';

function loadPresets(): Record<string, number[]> {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}'); } catch { return {}; }
}
function savePresets(p: Record<string, number[]>) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
}

interface D4HEqItem { id: number; title: string; ref?: string; category?: { title?: string } }

interface Props {
  onCreated: (op: Operation) => void;
  onCancel?: () => void;
}

const AGENCIES = ['RCMP', 'MHPS', 'AHS', 'STARS', 'CJFR', 'Other'];

const QUICK_TAGS = [
  'Missing Person', 'Lost Hiker', 'Overdue Vehicle', 'Overdue Hunter',
  'Avalanche', 'Swift Water', 'Technical Rescue', 'Medical', 'Dementia',
  'Mental Health', 'Child', 'Elderly', 'Horseback', 'ATV/OHV',
];

type CoordMode = 'utm' | 'latlon' | 'address';

type GeoResult = { display_name: string; lat: string; lon: string };

function parseLatLon(input: string): { lat: number; lon: number } | null {
  const cleaned = input.replace(/°/g, '').trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function CoordField({ label, value, onChange, required, apiKey }: {
  label: string;
  value: string;
  onChange: (utmRaw: string, parsed: { lat: number; lon: number } | null) => void;
  required?: boolean;
  apiKey?: string;
}) {
  const [mode, setMode] = useState<CoordMode>('utm');
  const [latlonInput, setLatlonInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);

  const utmParsed = value.trim() ? parseUTMString(value) : null;
  const isUtmValid = !value.trim() || utmParsed !== null;
  const latlonParsed = parseLatLon(latlonInput);

  function switchMode(m: CoordMode) {
    if (m === 'latlon' && utmParsed) {
      setLatlonInput(`${utmParsed.lat.toFixed(6)}, ${utmParsed.lon.toFixed(6)}`);
    }
    setMode(m);
    setResults([]);
  }

  function handleLatlonChange(input: string) {
    setLatlonInput(input);
    const ll = parseLatLon(input);
    if (ll) onChange(formatUTM(ll.lat, ll.lon), ll);
    else if (!input.trim()) onChange('', null);
  }

  async function doGeocode() {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setResults([]);
    try {
      const params = new URLSearchParams({ q: addressInput });
      if (apiKey?.trim()) params.set('key', apiKey.trim());
      const res = await fetch(`/api/geocode?${params}`);
      if (res.ok) setResults((await res.json()).slice(0, 5));
    } finally {
      setGeocoding(false);
    }
  }

  function selectResult(r: GeoResult) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    onChange(formatUTM(lat, lon), { lat, lon });
    setResults([]);
    setMode('utm');
  }

  const modeBtn = (m: CoordMode, lbl: string) => (
    <button type="button" key={m} onClick={() => switchMode(m)}
      className={`px-2 py-0.5 text-xs rounded transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {lbl}
    </button>
  );

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">
          {label}{required && ' *'}
        </label>
        <div className="flex gap-1">
          {modeBtn('utm', 'UTM')}
          {modeBtn('latlon', 'Lat / Lon')}
          {modeBtn('address', 'Address')}
        </div>
      </div>

      {mode === 'utm' && (
        <>
          <input
            value={value}
            onChange={e => onChange(e.target.value, parseUTMString(e.target.value))}
            placeholder="12U 355000E 5610000N"
            className={`w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${value.trim() && !isUtmValid ? 'border-red-400' : 'border-gray-300'}`}
          />
          {value.trim() && utmParsed ? (
            <p className="text-green-600 text-xs mt-1">{formatUTM(utmParsed.lat, utmParsed.lon)} · {utmParsed.lat.toFixed(5)}°, {utmParsed.lon.toFixed(5)}°</p>
          ) : value.trim() && !isUtmValid ? (
            <p className="text-red-500 text-xs mt-1">Invalid UTM — try: 12U 355000E 5610000N</p>
          ) : (
            <p className="text-gray-500 text-xs mt-1">ZoneNumber ZoneLetter Easting Northing — e.g. 12U 355000E 5610000N</p>
          )}
        </>
      )}

      {mode === 'latlon' && (
        <>
          <input
            value={latlonInput}
            onChange={e => handleLatlonChange(e.target.value)}
            placeholder="51.4234, -110.8234"
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {latlonParsed ? (
            <p className="text-green-600 text-xs mt-1">→ {formatUTM(latlonParsed.lat, latlonParsed.lon)}</p>
          ) : latlonInput.trim() ? (
            <p className="text-red-500 text-xs mt-1">Invalid — enter decimal degrees: 51.4234, -110.8234</p>
          ) : (
            <p className="text-gray-500 text-xs mt-1">Decimal degrees: latitude, longitude</p>
          )}
        </>
      )}

      {mode === 'address' && (
        <>
          <div className="flex gap-2">
            <input
              value={addressInput}
              onChange={e => setAddressInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doGeocode(); } }}
              placeholder="Medicine Hat, AB or trail name…"
              className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="button" onClick={doGeocode} disabled={geocoding}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {geocoding ? '…' : 'Search'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded bg-white shadow-sm">
              {results.map((r, i) => (
                <button key={i} type="button" onClick={() => selectResult(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors">
                  <div className="text-gray-800 truncate">{r.display_name}</div>
                  <div className="text-gray-500 text-xs">{parseFloat(r.lat).toFixed(5)}°, {parseFloat(r.lon).toFixed(5)}°</div>
                </button>
              ))}
            </div>
          )}
          {results.length === 0 && !geocoding && (
            <p className="text-gray-500 text-xs mt-1">Type an address or place name and press Search</p>
          )}
        </>
      )}

      {value.trim() && utmParsed && mode !== 'utm' && (
        <p className="text-green-600 text-xs mt-1">Set: {formatUTM(utmParsed.lat, utmParsed.lon)}</p>
      )}
    </div>
  );
}

function blank() {
  return {
    tasking_agency: '',
    oic_name: '',
    oic_phone: '',
    caltopo_map_url: '',
    caltopo_map_id: '',
    operation_type: 'search' as 'search' | 'rescue' | 'recovery' | 'assist',
    priority: '1',
    tags: [] as string[],
    lost_person_name: '',
    lost_person_age: '',
    subject_sex: '',
    subject_clothing: '',
    subject_gear: '',
    lost_person_description: '',
    pls_location: '',
    pls_utm: '',
    pls_lat: null as number | null,
    pls_lon: null as number | null,
    pls_time: '',
    reported_time: '',
    last_seen_location: '',
    lkp_utm: '',
    latitude: null as number | null,
    longitude: null as number | null,
    ipp_type: 'lkp' as 'pls' | 'lkp',
    subject_circumstance: '',
    subject_condition: '',
    terrain_type: 'mixed',
    safety_concerns: '',
    subject_category: '',
    name: '',
    deployed_equipment_ids: [] as number[],
    // D4H step
    d4h_activity_type: 'incident' as 'incident' | 'exercise',
    d4h_mode: 'create' as 'create' | 'link',
    d4h_existing_id: '',
    d4h_title: '',
    d4h_description: '',
    d4h_starts_at: '',
    d4h_ends_at: '',
  };
}

type FormState = ReturnType<typeof blank>;

const STEPS = [
  { id: 'dispatch',  label: 'Dispatch',   title: 'Dispatch Details' },
  { id: 'who',       label: 'WHO',        title: 'Who Are We Looking For?' },
  { id: 'where',     label: 'WHERE/WHEN', title: 'Where & When' },
  { id: 'what',      label: 'CONDITION',  title: 'Condition & Circumstance' },
  { id: 'safety',    label: 'SAFETY',     title: 'Safety Concerns' },
  { id: 'profile',   label: 'PROFILE',    title: 'Lost Person Behaviour Profile' },
  { id: 'd4h',       label: 'D4H',        title: 'D4H Incident / Exercise' },
  { id: 'equipment', label: 'EQUIPMENT',  title: 'Deployable Equipment' },
];

export default function OperationIntake({ onCreated, onCancel }: Props) {
  const { settings } = useSettings();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Equipment fetch (lazy — loads when SM reaches the equipment step)
  const [equipment, setEquipment] = useState<D4HEqItem[]>([]);
  const [eqLoading, setEqLoading] = useState(false);
  const [eqError, setEqError] = useState('');
  const [presets, setPresets] = useState<Record<string, number[]>>(loadPresets);
  const [newPresetName, setNewPresetName] = useState('');

  // ── Auto-populate D4H fields when reaching step 6 ────────────────────────
  useEffect(() => {
    if (step !== 6) return;
    const d = new Date().toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(',', '').replace(/ /g, '-').toUpperCase();
    if (!form.d4h_title) {
      const title = `${d} — ${form.lost_person_name || 'Missing Person'}`;
      set('d4h_title', title);
      if (!form.name) set('name', title);
    }
    if (!form.d4h_description) {
      const parts: string[] = [];
      if (form.lost_person_name) {
        parts.push(`Missing ${[form.lost_person_age ? `${form.lost_person_age}y` : '', form.subject_sex, form.lost_person_name].filter(Boolean).join(' ')}.`);
      }
      if (form.subject_circumstance) parts.push(`Circumstance: ${form.subject_circumstance.slice(0, 300)}`);
      if (form.tasking_agency)      parts.push(`Tasking: ${form.tasking_agency}`);
      if (form.oic_name)            parts.push(`OIC: ${form.oic_name}`);
      set('d4h_description', parts.join('\n'));
    }
    if (!form.d4h_starts_at) {
      set('d4h_starts_at', form.pls_time?.slice(0, 16) ?? new Date().toISOString().slice(0, 16));
    }
  }, [step]);

  // ── Load D4H equipment when reaching step 7 ───────────────────────────────
  useEffect(() => {
    if (step !== 7 || !settings.d4hToken || equipment.length > 0) return;
    setEqLoading(true); setEqError('');
    fetch('/api/d4h', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getEquipment', token: settings.d4hToken }),
    })
      .then(r => r.json())
      .then(d => setEquipment(d.equipment ?? []))
      .catch(() => setEqError('Could not load equipment from D4H'))
      .finally(() => setEqLoading(false));
  }, [step]);

  function toggleEquipment(id: number) {
    const cur = form.deployed_equipment_ids;
    set('deployed_equipment_ids', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  function applyPreset(ids: number[]) {
    set('deployed_equipment_ids', ids);
  }

  function savePreset() {
    if (!newPresetName.trim() || !form.deployed_equipment_ids.length) return;
    const updated = { ...presets, [newPresetName.trim()]: form.deployed_equipment_ids };
    savePresets(updated);
    setPresets(updated);
    setNewPresetName('');
  }

  function deletePreset(name: string) {
    const { [name]: _, ...rest } = presets;
    savePresets(rest);
    setPresets(rest);
  }

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  function autoName() {
    const d = new Date().toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(',', '').replace(/ /g, '-').toUpperCase();
    const subj = form.lost_person_name ? `Missing – ${form.lost_person_name}` : 'Missing Person';
    return `${subj} ${d}`;
  }

  function nextStep() {
    // Set name before Profile step so D4H title can use it
    if (step === 4 && !form.name) set('name', autoName());
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function toggleTag(tag: string) {
    set('tags', form.tags.includes(tag)
      ? form.tags.filter(t => t !== tag)
      : [...form.tags, tag]);
  }

  function toggleSafety(concern: string) {
    const cur = form.safety_concerns;
    set('safety_concerns', cur.includes(concern)
      ? cur.replace(concern + '; ', '').replace('; ' + concern, '').replace(concern, '').trim()
      : cur ? `${cur}; ${concern}` : concern);
  }

  async function submit() {
    if (!form.subject_category) { setError('Please select a behaviour profile.'); return; }
    setSaving(true);
    setError('');

    // ── Create D4H incident or exercise first ─────────────────────────────────
    let d4hIncidentId: string | undefined;
    let d4hExerciseId: string | undefined;

    if (settings.d4hToken) {
      try {
        if (form.d4h_mode === 'link' && form.d4h_existing_id.trim()) {
          // ── Link mode: update the existing D4H record ──────────────────────
          const existingId = form.d4h_existing_id.trim();
          await fetch('/api/d4h', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateIncident',
              token: settings.d4hToken,
              incidentId: existingId,
              title: form.d4h_title.trim() || form.name || autoName(),
              description: form.d4h_description.trim(),
            }),
          });
          // Save the linked ID to the operation regardless of update success
          if (form.d4h_activity_type === 'exercise') d4hExerciseId = existingId;
          else d4hIncidentId = existingId;

        } else if (form.d4h_mode === 'create' && form.d4h_title.trim()) {
          // ── Create mode: create a new D4H record ───────────────────────────
          const d4hPayload = {
            title:       form.d4h_title.trim(),
            description: form.d4h_description.trim(),
            startsAt:    form.d4h_starts_at ? new Date(form.d4h_starts_at).toISOString() : new Date().toISOString(),
            endsAt:      form.d4h_ends_at   ? new Date(form.d4h_ends_at).toISOString()   : undefined,
          };
          const action = form.d4h_activity_type === 'exercise' ? 'createExercise' : 'createIncident';
          const res = await fetch('/api/d4h', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, token: settings.d4hToken, ...d4hPayload }),
          });
          const data = await res.json();
          if (res.ok) {
            if (form.d4h_activity_type === 'exercise') d4hExerciseId = String(data.exerciseId);
            else d4hIncidentId = String(data.incidentId);
          } else {
            console.warn('D4H creation failed:', data.error);
          }
        }
      } catch {
        // Non-fatal: still create the operation
      }
    }

    try {
      const op = operationsStore.create({
        name: form.name || autoName(),
        operation_type: form.operation_type,
        priority: Number(form.priority) as 1 | 2 | 3,
        tasking_agency: form.tasking_agency || undefined,
        oic_name: form.oic_name || undefined,
        oic_phone: form.oic_phone || undefined,
        tags: form.tags.length ? form.tags : undefined,
        caltopo_map_url: form.caltopo_map_url || undefined,
        caltopo_map_id: form.caltopo_map_id || undefined,
        lost_person_name: form.lost_person_name || undefined,
        lost_person_age: form.lost_person_age ? Number(form.lost_person_age) : undefined,
        subject_sex: form.subject_sex || undefined,
        subject_clothing: form.subject_clothing || undefined,
        subject_gear: form.subject_gear || undefined,
        lost_person_description: form.lost_person_description || undefined,
        pls_location: form.pls_location || undefined,
        pls_lat: form.pls_lat ?? undefined,
        pls_lon: form.pls_lon ?? undefined,
        pls_time: form.pls_time || undefined,
        reported_time: form.reported_time || undefined,
        last_seen_location: form.last_seen_location || undefined,
        lkp_utm: form.lkp_utm || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        ipp_type: form.ipp_type,
        subject_circumstance: form.subject_circumstance || undefined,
        subject_condition: form.subject_condition || undefined,
        terrain_type: form.terrain_type,
        safety_concerns: form.safety_concerns || undefined,
        subject_category: form.subject_category,
        deploy_decision: null,
        deployed_equipment_ids: form.deployed_equipment_ids.length ? form.deployed_equipment_ids : undefined,
        d4h_incident_id: d4hIncidentId,
        d4h_exercise_id: d4hExerciseId,
        d4h_activity_type: form.d4h_activity_type,
      });
      onCreated(op);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create operation');
    } finally {
      setSaving(false);
    }
  }

  const chip = (selected: boolean) =>
    `px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
      selected ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-blue-400'
    }`;

  const dangerChip = (selected: boolean) =>
    `px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
      selected ? 'bg-red-50 text-red-700 border-red-400' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-red-400'
    }`;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              onClick={() => i < step && setStep(i)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? 'bg-blue-600' : 'bg-gray-200'} ${i < step ? 'cursor-pointer' : ''}`}
            />
          ))}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Step {step + 1} of {STEPS.length} — {STEPS[step].label}
          </span>
          {onCancel && (
            <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          )}
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-800 mb-4">{STEPS[step].title}</h2>
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* ── Step 0: DISPATCH ── */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Record the tasking details from the incoming call.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tasking Agency *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {AGENCIES.map(a => (
                <button key={a} type="button" onClick={() => set('tasking_agency', a === 'Other' ? '' : a)}
                  className={chip(form.tasking_agency === a)}>
                  {a}
                </button>
              ))}
            </div>
            <input value={form.tasking_agency} onChange={e => set('tasking_agency', e.target.value)}
              placeholder="Or type agency name…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Officer In Charge *</label>
              <input value={form.oic_name} onChange={e => set('oic_name', e.target.value)}
                placeholder="Full name"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OIC Phone</label>
              <input type="tel" value={form.oic_phone} onChange={e => set('oic_phone', e.target.value)}
                placeholder="403-555-0100"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operation Type</label>
              <select value={form.operation_type} onChange={e => set('operation_type', e.target.value as 'search' | 'rescue' | 'recovery' | 'assist')}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="search">Search</option>
                <option value="rescue">Rescue</option>
                <option value="recovery">Recovery</option>
                <option value="assist">Assist</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="1">P1 – Critical</option>
                <option value="2">P2 – High</option>
                <option value="3">P3 – Normal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Tags</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_TAGS.map(tag => (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  className={chip(form.tags.includes(tag))}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CalTopo Map URL (optional)</label>
            <input type="url" value={form.caltopo_map_url}
              onChange={e => {
                const url = e.target.value;
                const match = url.match(/\/m\/([A-Za-z0-9]+)/);
                set('caltopo_map_url', url);
                set('caltopo_map_id', match ? match[1].toUpperCase() : '');
              }}
              placeholder="https://caltopo.com/m/ABC123"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {form.caltopo_map_id
              ? <p className="text-green-600 text-xs mt-1">Map ID: {form.caltopo_map_id}</p>
              : <p className="text-gray-500 text-xs mt-1">Leave blank — a new map will be created automatically on deploy.</p>}
          </div>
        </div>
      )}

      {/* ── Step 1: WHO ── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Describe the subject. Every detail helps identify them in the field.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={form.lost_person_name} onChange={e => set('lost_person_name', e.target.value)}
                placeholder="First Last" autoFocus
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input type="number" min="0" max="120" value={form.lost_person_age} onChange={e => set('lost_person_age', e.target.value)}
                placeholder="45"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
            <div className="flex gap-2">
              {['Male', 'Female', 'Unknown'].map(s => (
                <button key={s} type="button" onClick={() => set('subject_sex', s)} className={chip(form.subject_sex === s)}>{s}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clothing Description</label>
            <textarea value={form.subject_clothing} onChange={e => set('subject_clothing', e.target.value)}
              rows={3} placeholder="Red jacket, blue jeans, yellow hiking boots…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gear / Equipment</label>
            <input value={form.subject_gear} onChange={e => set('subject_gear', e.target.value)}
              placeholder="Day pack, trekking poles, no tent…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Physical Description</label>
            <input value={form.lost_person_description} onChange={e => set('lost_person_description', e.target.value)}
              placeholder="6ft, brown hair, beard, glasses…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {/* ── Step 2: WHERE / WHEN ── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Enter UTM coordinates where possible. Both PLS and LKP will be plotted on CalTopo — select which one is the <strong>IPP</strong> for probability rings.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Last Seen</label>
              <input type="datetime-local" value={form.pls_time} onChange={e => set('pls_time', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Reported Missing</label>
              <input type="datetime-local" value={form.reported_time} onChange={e => set('reported_time', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="font-semibold text-sm mb-3">PLS — Point Last Seen</div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">PLS Description</label>
              <input value={form.pls_location} onChange={e => set('pls_location', e.target.value)}
                placeholder="Trailhead parking lot, junction of trails…"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <CoordField label="PLS Coordinates (UTM)" value={form.pls_utm}
              onChange={(raw, parsed) => { set('pls_utm', raw); set('pls_lat', parsed?.lat ?? null); set('pls_lon', parsed?.lon ?? null); }}
              apiKey={settings.hereApiKey} />
          </div>

          <div className="border-t pt-4">
            <div className="font-semibold text-sm mb-1">LKP — Last Known Point</div>
            <p className="text-xs text-gray-500 mb-3">Leave blank if same as PLS or unknown.</p>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">LKP Description</label>
              <input value={form.last_seen_location} onChange={e => set('last_seen_location', e.target.value)}
                placeholder="Vehicle at trailhead, last cell ping…"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <CoordField label="LKP Coordinates (UTM)" value={form.lkp_utm}
              onChange={(raw, parsed) => { set('lkp_utm', raw); set('latitude', parsed?.lat ?? null); set('longitude', parsed?.lon ?? null); }}
              apiKey={settings.hereApiKey} />
          </div>

          <div className="border-t pt-4">
            <div className="font-semibold text-sm mb-2">Select IPP — Initial Planning Point</div>
            <p className="text-xs text-gray-500 mb-3">Probability rings will be drawn around the IPP on CalTopo.</p>
            <div className="flex gap-3">
              {[
                { val: 'pls', label: 'PLS', desc: form.pls_location || 'Point Last Seen', hasCoords: !!(form.pls_lat && form.pls_lon) },
                { val: 'lkp', label: 'LKP', desc: form.last_seen_location || 'Last Known Point', hasCoords: !!(form.latitude && form.longitude) },
              ].map(opt => (
                <div key={opt.val} onClick={() => set('ipp_type', opt.val as 'pls' | 'lkp')}
                  className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-colors ${form.ipp_type === opt.val ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                  <div className={`text-lg font-bold mb-1 ${form.ipp_type === opt.val ? 'text-blue-600' : 'text-gray-700'}`}>{opt.label}</div>
                  <div className="text-xs text-gray-500 mb-2">{opt.desc}</div>
                  <span className={`text-xs font-medium ${opt.hasCoords ? 'text-green-600' : 'text-gray-500'}`}>
                    {opt.hasCoords ? 'Coordinates set' : 'No coordinates'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: CONDITION ── */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Document the activity, medical status, and mental health context.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Circumstance / Activity</label>
            <textarea value={form.subject_circumstance} onChange={e => set('subject_circumstance', e.target.value)}
              rows={4} autoFocus
              placeholder="Went hiking with a friend, separated near the summit. Vehicle still at trailhead…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Medical Conditions</label>
            <textarea value={form.subject_condition} onChange={e => set('subject_condition', e.target.value)}
              rows={3}
              placeholder="Diabetic, cardiac history, uses a cane…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Terrain</label>
            <div className="flex flex-wrap gap-2">
              {[
                { val: 'forest', label: '🌲 Forest' },
                { val: 'prairie', label: '🌾 Prairie' },
                { val: 'mountain', label: '🏔️ Mountain' },
                { val: 'urban', label: '🏙️ Urban' },
                { val: 'water', label: '🌊 Water' },
                { val: 'mixed', label: '🗺️ Mixed' },
              ].map(t => (
                <button key={t.val} type="button" onClick={() => set('terrain_type', t.val)} className={chip(form.terrain_type === t.val)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: SAFETY ── */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Document any hazards before teams are deployed.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Safety Concerns</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                'Subject may be armed',
                'Avalanche terrain',
                'Technical terrain / vertical hazard',
                'Swift water',
                'Wildlife (bear/cougar)',
                'Extreme weather',
                'Remote / limited comms',
                'Hazmat',
                'Subject volatile / mental health crisis',
                'Thin ice',
                'Night operations',
              ].map(concern => (
                <button key={concern} type="button" onClick={() => toggleSafety(concern)} className={dangerChip(form.safety_concerns.includes(concern))}>
                  {concern}
                </button>
              ))}
            </div>
            <textarea value={form.safety_concerns} onChange={e => set('safety_concerns', e.target.value)}
              rows={3} placeholder="Additional safety notes…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>
        </div>
      )}

      {/* ── Step 5: PROFILE ── */}
      {step === 5 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Select the ISRID lost person behaviour profile. This determines probability ring distances published to CalTopo.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(ISRID).map(([id, p]) => (
              <div key={id} onClick={() => set('subject_category', id)}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.subject_category === id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                <div className="text-2xl mb-1">{p.emoji}</div>
                <div className={`font-semibold text-sm mb-1 ${form.subject_category === id ? 'text-blue-700' : 'text-gray-800'}`}>{p.label}</div>
                <div className="text-xs text-gray-500 leading-snug">{p.notes}</div>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Operation Name</label>
            <input value={form.name || autoName()} onChange={e => set('name', e.target.value)}
              placeholder="Auto-generated — edit if needed"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {/* ── Step 6: D4H INCIDENT / EXERCISE ── */}
      {step === 6 && (
        <div className="space-y-4">
          {!settings.d4hToken ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              D4H token not configured — this step will be skipped and the D4H record can be created from the operation page.{' '}
              <a href="/settings" target="_blank" className="underline">Configure in Settings ↗</a>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Pre-populated from your operation. Review and correct — any changes here write back to the operation.
            </p>
          )}

          {/* Mode + Activity type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
              <div className="flex gap-2">
                {(['create', 'link'] as const).map(m => (
                  <button key={m} type="button" onClick={() => set('d4h_mode', m)} className={chip(form.d4h_mode === m)}>
                    {m === 'create' ? 'Create New' : 'Link Existing'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Activity Type</label>
              <div className="flex gap-2">
                {(['incident', 'exercise'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('d4h_activity_type', t)} className={chip(form.d4h_activity_type === t)}>
                    {t === 'incident' ? 'Incident' : 'Exercise'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Link existing — just enter the D4H number */}
          {form.d4h_mode === 'link' && settings.d4hToken && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Existing D4H {form.d4h_activity_type === 'exercise' ? 'Exercise' : 'Incident'} Number
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.d4h_existing_id}
                onChange={e => set('d4h_existing_id', e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 475775"
                className="w-48 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                The existing D4H record will be updated with this operation's title and description.
              </p>
            </div>
          )}

          {settings.d4hToken && form.d4h_mode === 'create' && (<>
            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <span className="text-xs text-gray-400">↩ writes to operation name</span>
              </div>
              <input value={form.d4h_title} onChange={e => { set('d4h_title', e.target.value); set('name', e.target.value); }}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.d4h_description} onChange={e => set('d4h_description', e.target.value)}
                rows={5} className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y text-sm" />
            </div>

            {/* Start / End time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Start Time</label>
                  <span className="text-xs text-gray-400">↩ writes to PLS time</span>
                </div>
                <input type="datetime-local" value={form.d4h_starts_at}
                  onChange={e => { set('d4h_starts_at', e.target.value); set('pls_time', e.target.value); }}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time{form.d4h_activity_type === 'exercise' ? ' *' : ' (optional)'}
                </label>
                <input type="datetime-local" value={form.d4h_ends_at} onChange={e => set('d4h_ends_at', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              The D4H {form.d4h_activity_type} will be created in D4H when you complete the form. The ID will be saved to this operation automatically.
            </div>
          </> )}

          {settings.d4hToken && form.d4h_mode === 'link' && form.d4h_existing_id && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              D4H {form.d4h_activity_type} #{form.d4h_existing_id} will be updated with this operation's title and description when you complete the form.
            </div>
          )}
        </div>
      )}

      {/* ── Step 7: EQUIPMENT ── */}
      {step === 7 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Select the equipment being deployed on this operation.
            {!settings.d4hToken && ' Configure a D4H token in Settings to load equipment from D4H.'}
          </p>

          {/* Presets */}
          {Object.keys(presets).length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Saved Presets</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(presets).map(([name, ids]) => (
                  <div key={name} className="flex items-center gap-1">
                    <button type="button" onClick={() => applyPreset(ids)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        JSON.stringify(form.deployed_equipment_ids.slice().sort()) === JSON.stringify(ids.slice().sort())
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
                      }`}>
                      {name}
                      <span className="text-xs opacity-70 ml-1">({ids.length})</span>
                    </button>
                    <button type="button" onClick={() => deletePreset(name)}
                      title="Delete preset"
                      className="text-gray-400 hover:text-red-500 text-xs px-1">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipment list */}
          {!settings.d4hToken ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 text-sm">
              D4H not configured — equipment list unavailable.
            </div>
          ) : eqLoading ? (
            <div className="text-center text-gray-500 py-8">Loading equipment from D4H…</div>
          ) : eqError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{eqError}</div>
          ) : equipment.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">No equipment found in D4H.</div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {equipment.map((item, i) => (
                <label key={item.id}
                  className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${form.deployed_equipment_ids.includes(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                  <input type="checkbox"
                    checked={form.deployed_equipment_ids.includes(item.id)}
                    onChange={() => toggleEquipment(item.id)}
                    className="w-4 h-4 accent-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                    {(item.ref || item.category?.title) && (
                      <div className="text-xs text-gray-500">
                        {[item.ref, item.category?.title].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Save as preset */}
          {form.deployed_equipment_ids.length > 0 && (
            <div className="flex gap-2 items-center">
              <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)}
                placeholder="Save selection as preset…"
                className="flex-1 p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={savePreset} disabled={!newPresetName.trim()}
                className="px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-800 disabled:opacity-50 transition-colors">
                Save
              </button>
            </div>
          )}

          {form.deployed_equipment_ids.length > 0 && (
            <p className="text-sm text-green-700 font-medium">
              {form.deployed_equipment_ids.length} item{form.deployed_equipment_ids.length !== 1 ? 's' : ''} selected for deployment
            </p>
          )}
        </div>
      )}

      {/* ── Step 7 (final): EQUIPMENT + REVIEW ── */}
      {/* Equipment picker already rendered above as step === 7 */}
      {/* Review panel appended at bottom of equipment step */}
      {step === 7 && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm mt-4">
          <div className="font-semibold text-gray-700 mb-3">Review</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {[
              ['Agency',    form.tasking_agency],
              ['OIC',       form.oic_name],
              ['Tags',      form.tags.join(', ')],
              ['Subject',   [form.lost_person_name, form.lost_person_age ? `${form.lost_person_age}y` : '', form.subject_sex].filter(Boolean).join(', ')],
              ['PLS',       form.pls_location?.slice(0, 40)],
              ['LKP',       form.last_seen_location?.slice(0, 40)],
              ['IPP',       form.ipp_type?.toUpperCase()],
              ['Terrain',   form.terrain_type],
              ['Safety',    form.safety_concerns?.slice(0, 60)],
              ['Profile',   ISRID[form.subject_category]?.label],
              ['D4H',       form.d4h_title ? `${form.d4h_activity_type === 'exercise' ? 'Exercise' : 'Incident'}: ${form.d4h_title.slice(0, 40)}` : undefined],
              ['Equipment', form.deployed_equipment_ids.length ? `${form.deployed_equipment_ids.length} item${form.deployed_equipment_ids.length !== 1 ? 's' : ''} selected` : undefined],
            ].map(([k, v]) => v ? (
              <div key={String(k)} className="contents">
                <span className="text-gray-500 font-medium">{k}</span>
                <span className="text-gray-800">{v}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8 gap-3">
        <div>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              ← Back
            </button>
          )}
        </div>
        <div className="flex gap-3 items-center">
          {error && <span className="text-red-500 text-sm">{error}</span>}
          {step < STEPS.length - 1 ? (
            <button onClick={nextStep}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
              Next →
            </button>
          ) : (
            <button onClick={submit} disabled={saving || !form.subject_category}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Creating…' : 'Create Operation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
