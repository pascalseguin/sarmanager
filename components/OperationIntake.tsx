'use client';

import { useState, useEffect } from 'react';
import { Operation } from '@/lib/operations-store';
import { parseUTMString, formatUTM } from '@/lib/utm';
import { ISRID, circlePolygon } from '@/lib/isrid';
import { useSettings } from '@/lib/settings-context';

interface DeploymentPreset {
  id: string; name: string; description?: string;
  items_json: string; equipment_ids_json: string; containers: string[];
}

interface Props {
  onCreated: (op: Operation) => void;
  onCancel?: () => void;
}


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

function CoordField({ label, value, onChange, required, apiKey, geocodeCountry, geocodeRegion }: {
  label: string;
  value: string;
  onChange: (utmRaw: string, parsed: { lat: number; lon: number } | null) => void;
  required?: boolean;
  apiKey?: string;
  geocodeCountry?: string;
  geocodeRegion?: string;
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
      if (apiKey?.trim())        params.set('key', apiKey.trim());
      if (geocodeCountry?.trim()) params.set('country', geocodeCountry.trim());
      if (geocodeRegion?.trim())  params.set('region', geocodeRegion.trim());
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
    police_file_number: '',
    deployed_preset_ids: [] as string[],
    ipp_direct_disabled: false,
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
  const [d4hWarning, setD4hWarning] = useState('');

  // ── Post-creation deploy wizard state ────────────────────────────────────
  type RolloutStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';
  const [createdOp, setCreatedOp] = useState<Operation | null>(null);
  const [deployMode, setDeployMode] = useState<'decide' | 'deploy' | 'discuss'>('decide');
  const [discussWhy, setDiscussWhy] = useState('');
  const [rollout, setRollout] = useState<{
    d4h: RolloutStatus; caltopo: RolloutStatus; sms: RolloutStatus; whiteboard: RolloutStatus;
    errors: Record<string, string>; d4hId?: string; caltopoUrl?: string; smsCount: number; done: boolean;
  }>({ d4h: 'idle', caltopo: 'idle', sms: 'idle', whiteboard: 'idle', errors: {}, smsCount: 0, done: false });
  const [rolloutRunning, setRolloutRunning] = useState(false);

  // Deployment presets (lazy — loads when SM reaches the equipment step)
  const [availablePresets, setAvailablePresets] = useState<DeploymentPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState('');

  // ── Auto-populate D4H fields when reaching step 6 ────────────────────────
  useEffect(() => {
    if (step !== 6) return;
    const d = new Date().toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(',', '').replace(/ /g, '-').toUpperCase();
    if (!form.d4h_title) {
      const fileNum = form.police_file_number?.trim();
      const title = `${fileNum ? fileNum + ' — ' : ''}${d} — ${form.lost_person_name || 'Missing Person'}`;
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

  // ── Load deployment presets when reaching step 7 ─────────────────────────
  useEffect(() => {
    if (step !== 7 || availablePresets.length > 0) return;
    setPresetsLoading(true); setPresetsError('');
    const token = localStorage.getItem('sarmanager_session_token') ?? '';
    fetch('/api/equipment/presets', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setAvailablePresets(d.presets ?? []))
      .catch(() => setPresetsError('Could not load deployment presets'))
      .finally(() => setPresetsLoading(false));
  }, [step, availablePresets.length]);

  function togglePreset(id: string) {
    const cur = form.deployed_preset_ids;
    set('deployed_preset_ids', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  function autoName(d4hId = '') {
    const template = settings.opNameTemplate || '{location}-{date}-{d4h_id}';
    const date     = new Date().toISOString().slice(0, 10);
    const rawLoc   = form.last_seen_location || form.pls_location || '';
    const location = rawLoc.split(',')[0]?.trim() || 'Location';
    const subject  = form.lost_person_name || '';
    const fileNum  = form.police_file_number?.trim() || '';
    let name = template
      .replace(/\{location\}/g, location)
      .replace(/\{date\}/g, date)
      .replace(/\{d4h_id\}/g, d4hId)
      .replace(/\{subject\}/g, subject)
      .replace(/\{file_number\}/g, fileNum)
      .replace(/[-–]{2,}/g, '-')
      .replace(/^[-–\s]+|[-–\s]+$/g, '')
      .trim() || `${location}-${date}`;
    // If a file number is set but the template doesn't include {file_number}, prepend it
    if (fileNum && !template.includes('{file_number}')) name = `${fileNum} ${name}`;
    return name;
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
        const d4hBase = {
          token: settings.d4hToken,
          ...(settings.d4hTeamId ? { teamId: Number(settings.d4hTeamId) } : {}),
        };
        const isExercise = form.d4h_activity_type === 'exercise';

        if (form.d4h_mode === 'link' && form.d4h_existing_id.trim()) {
          // ── Link mode: update the existing D4H record ──────────────────────
          const existingId = form.d4h_existing_id.trim();
          const updateAction = isExercise ? 'updateExercise' : 'updateIncident';
          const idKey        = isExercise ? 'exerciseId'    : 'incidentId';
          await fetch('/api/d4h', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...d4hBase,
              action: updateAction,
              [idKey]: existingId,
              title: form.d4h_title.trim() || form.name || autoName(),
              description: form.d4h_description.trim(),
            }),
          });
          if (isExercise) d4hExerciseId = existingId;
          else d4hIncidentId = existingId;

        } else if (form.d4h_mode === 'create' && form.d4h_title.trim()) {
          // ── Create mode: create a new D4H record ───────────────────────────
          const createAction = isExercise ? 'createExercise' : 'createIncident';
          const res = await fetch('/api/d4h', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...d4hBase,
              action: createAction,
              title:       form.d4h_title.trim(),
              description: form.d4h_description.trim(),
              startsAt:    form.d4h_starts_at ? new Date(form.d4h_starts_at).toISOString() : new Date().toISOString(),
              endsAt:      form.d4h_ends_at   ? new Date(form.d4h_ends_at).toISOString()   : undefined,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            if (isExercise) d4hExerciseId = String(data.exerciseId ?? data.exercise?.id);
            else d4hIncidentId = String(data.incidentId ?? data.incident?.id);
          } else {
            setD4hWarning(`D4H creation failed: ${data.error ?? 'unknown error'} — you can link it manually later.`);
          }
        }
      } catch (e: unknown) {
        setD4hWarning(`D4H creation error: ${e instanceof Error ? e.message : 'unknown error'} — you can link it manually later.`);
      }
    }

    try {
      const token = localStorage.getItem('sarmanager_session_token') ?? '';
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name || autoName(d4hIncidentId ?? d4hExerciseId ?? ''),
          operation_type: form.operation_type,
          priority: Number(form.priority),
          tasking_agency: form.tasking_agency || undefined,
          oic_name: form.oic_name || undefined,
          oic_phone: form.oic_phone || undefined,
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
          latitude: form.latitude ?? undefined,
          longitude: form.longitude ?? undefined,
          ipp_type: form.ipp_type,
          subject_circumstance: form.subject_circumstance || undefined,
          subject_condition: form.subject_condition || undefined,
          terrain_type: form.terrain_type,
          safety_concerns: form.safety_concerns || undefined,
          subject_category: form.subject_category,
          d4h_incident_id: d4hIncidentId,
          d4h_exercise_id: d4hExerciseId,
          d4h_activity_type: form.d4h_activity_type,
          police_file_number: form.police_file_number?.trim() || undefined,
          deployed_presets_json: JSON.stringify(form.deployed_preset_ids),
          ipp_direct_disabled: form.ipp_direct_disabled ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create operation');
      // Background qual sync — non-blocking, best-effort
      if (settings.d4hToken && settings.d4hTeamId) {
        fetch('/api/personnel/sync-d4h', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: settings.d4hToken, teamId: Number(settings.d4hTeamId) }),
        }).catch(() => {});
      }
      // Move to deploy wizard instead of navigating away immediately
      setCreatedOp(data.operation as Operation);
      setDeployMode('decide');
      setRollout({ d4h: 'idle', caltopo: 'idle', sms: 'idle', whiteboard: 'idle', errors: {}, smsCount: 0, done: false });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create operation');
    } finally {
      setSaving(false);
    }
  }

  // ── Deploy wizard helpers ─────────────────────────────────────────────────

  async function patchCreatedOp(patch: Record<string, unknown>): Promise<Operation> {
    if (!createdOp) throw new Error('No operation');
    const token = localStorage.getItem('sarmanager_session_token') ?? '';
    const res = await fetch(`/api/operations/${createdOp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    const updated = (data.operation ?? createdOp) as Operation;
    setCreatedOp(updated);
    return updated;
  }

  async function handleDeploy() {
    if (!createdOp) return;
    const op = await patchCreatedOp({ deploy_decision: 'yes', deploy_timestamp: new Date().toISOString() }).catch(() => createdOp);
    setDeployMode('deploy');
    runWizardRollout(op);
  }

  async function runWizardRollout(op: Operation) {
    setRolloutRunning(true);
    let cur = op;

    // ── 1. D4H ──────────────────────────────────────────────────────────────
    const alreadyD4H = Boolean(op.d4h_incident_id || op.d4h_exercise_id);
    if (!alreadyD4H && settings.d4hToken && settings.d4hTeamId) {
      setRollout(r => ({ ...r, d4h: 'running' }));
      try {
        const isExercise = op.d4h_activity_type === 'exercise';
        const d = new Date();
        const dateStr = d.toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' })
          .toUpperCase().replace(/ /g, '-').replace(',', '');

        const fileNum = op.police_file_number?.trim() ?? '';
        const createRes = await fetch('/api/d4h', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isExercise ? 'createExercise' : 'createIncident',
            token: settings.d4hToken,
            teamId: Number(settings.d4hTeamId),
            title: `${fileNum ? fileNum + ' — ' : ''}${dateStr} PENDING`,
            description: [
              op.lost_person_name ? `Missing ${[op.lost_person_age ? `${op.lost_person_age}y` : '', op.subject_sex, op.lost_person_name].filter(Boolean).join(' ')}.` : '',
              op.subject_circumstance ? `Circumstance: ${op.subject_circumstance.slice(0, 200)}` : '',
              op.tasking_agency ? `Tasking: ${op.tasking_agency}` : '',
              op.oic_name ? `OIC: ${op.oic_name}` : '',
            ].filter(Boolean).join('\n'),
          }),
        });
        const createData = await createRes.json();
        const activityId = isExercise
          ? (createData.exerciseId ?? createData.exercise?.id)
          : (createData.incidentId ?? createData.incident?.id);

        if (!activityId) throw new Error('D4H returned no ID');

        // Rename to include D4H ID (non-fatal)
        fetch('/api/d4h', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isExercise ? 'updateExercise' : 'updateIncident',
            token: settings.d4hToken,
            teamId: Number(settings.d4hTeamId),
            [isExercise ? 'exerciseId' : 'incidentId']: activityId,
            title: `${fileNum ? fileNum + ' — ' : ''}${dateStr} #${activityId}`,
          }),
        }).catch(() => {});

        cur = await patchCreatedOp(isExercise
          ? { d4h_exercise_id: String(activityId) }
          : { d4h_incident_id: String(activityId) });
        setRollout(r => ({ ...r, d4h: 'done', d4hId: String(activityId) }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'D4H error';
        setRollout(r => ({ ...r, d4h: 'error', errors: { ...r.errors, d4h: msg } }));
      }
    } else {
      setRollout(r => ({
        ...r,
        d4h: alreadyD4H ? 'done' : 'skipped',
        d4hId: cur.d4h_incident_id ?? cur.d4h_exercise_id ?? undefined,
      }));
    }

    // ── 2. CalTopo ───────────────────────────────────────────────────────────
    const ippLat = cur.ipp_type === 'pls' ? cur.pls_lat : cur.latitude;
    const ippLon = cur.ipp_type === 'pls' ? cur.pls_lon : cur.longitude;
    const caltopoConfigured = Boolean(settings.credentialId && settings.secret && settings.accountId);
    if (!cur.caltopo_map_id && ippLat && ippLon && caltopoConfigured) {
      setRollout(r => ({ ...r, caltopo: 'running' }));
      try {
        const profile = ISRID[cur.subject_category ?? ''] ?? ISRID.hiker;
        const d4hId = cur.d4h_incident_id ?? cur.d4h_exercise_id;

        const albertaDate = new Date().toLocaleDateString('en-CA', {
          timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
        });

        // Reverse geocode the IPP to get the real municipality/neighbourhood
        let geoLocation = '';
        try {
          const rgParams = new URLSearchParams({ lat: String(ippLat), lon: String(ippLon) });
          if (settings.hereApiKey?.trim()) rgParams.set('key', settings.hereApiKey.trim());
          const rgRes = await fetch(`/api/geocode?${rgParams}`);
          if (rgRes.ok) geoLocation = ((await rgRes.json()).municipality ?? '').trim();
        } catch { /* non-fatal — fall back to user-entered text */ }

        // Build location slug: prefer geocoded municipality, fall back to user-entered text
        const fallbackDesc = (cur.ipp_type === 'pls' ? cur.pls_location : cur.last_seen_location) ?? '';
        const rawLocation = geoLocation || fallbackDesc.split(',')[0]?.trim() || 'Location';
        const locationSlug = rawLocation.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');

        // Apply op-name template so map title and operation name always match
        const template    = settings.opNameTemplate || '{location}-{date}-{d4h_id}';
        const mapFileNum  = cur.police_file_number?.trim() ?? '';
        let mapTitle = template
          .replace(/\{location\}/g, locationSlug)
          .replace(/\{date\}/g, albertaDate)
          .replace(/\{d4h_id\}/g, d4hId ?? '0000000')
          .replace(/\{subject\}/g, cur.lost_person_name ?? '')
          .replace(/\{file_number\}/g, mapFileNum)
          .replace(/[-–]{2,}/g, '-')
          .replace(/^[-–\s]+|[-–\s]+$/g, '')
          .trim() || `${locationSlug}-${albertaDate}`;
        if (mapFileNum && !template.includes('{file_number}')) mapTitle = `${mapFileNum} ${mapTitle}`;

        const ctBase = { credentialId: settings.credentialId, secret: settings.secret, accountId: settings.accountId };
        const ct = (action: string, extra: object) => fetch('/api/caltopo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...ctBase, ...extra }),
        }).then(r => r.json());

        const { mapId, url } = await ct('createMap', { title: mapTitle, folderId: settings.folderId || undefined });

        const subjectName = cur.lost_person_name ?? 'Subject';
        const ippLabel = cur.ipp_type === 'pls' ? 'PLS (IPP)' : 'LKP (IPP)';

        await ct('addFeature', {
          mapId, folderId: settings.ippFolderId || undefined,
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ippLon, ippLat] },
            properties: { title: `${ippLabel} – ${subjectName}`, class: 'Marker', 'marker-color': '#FF6B35', 'marker-symbol': 'cp' },
          },
        });

        if (cur.pls_lat && cur.pls_lon && cur.latitude && cur.longitude) {
          const secLat = cur.ipp_type === 'lkp' ? cur.pls_lat : cur.latitude;
          const secLon = cur.ipp_type === 'lkp' ? cur.pls_lon : cur.longitude;
          const secLabel = cur.ipp_type === 'lkp' ? 'PLS' : 'LKP';
          await ct('addFeature', {
            mapId, folderId: settings.ippFolderId || undefined,
            feature: {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [secLon, secLat] },
              properties: { title: `${secLabel} – ${subjectName}`, class: 'Marker', 'marker-color': cur.ipp_type === 'lkp' ? '#0088FF' : '#FF00FF' },
            },
          });
        }

        const RING_COLORS_CT: Record<number, string> = { 25: '#FF0000', 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
        const ringPcts = settings.lpbRingPcts?.length ? settings.lpbRingPcts : [50, 75, 95];
        for (const { pct, km } of profile.distances.filter((d: { pct: number }) => ringPcts.includes(d.pct))) {
          const ring = circlePolygon(ippLat, ippLon, km);
          ring.properties = {
            title: `${pct}% Probability (${km}km) – ${profile.label}`,
            class: 'Shape', stroke: RING_COLORS_CT[pct] ?? '#aaa',
            'stroke-width': 2, fill: RING_COLORS_CT[pct] ?? '#aaa', 'fill-opacity': 0,
          };
          await ct('addFeature', { mapId, folderId: settings.ringFolderId || undefined, feature: ring });
        }

        // Local snapshot for the board tab
        const snapFeatures = [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [ippLon, ippLat] }, properties: { title: `${ippLabel} – ${subjectName}`, color: '#FF6B35', class: 'Marker' } },
          ...(profile.distances.filter((d: { pct: number }) => ringPcts.includes(d.pct)).map(({ pct, km }: { pct: number; km: number }) => {
            const ring = circlePolygon(ippLat, ippLon, km);
            ring.properties = { title: `${pct}%`, stroke: RING_COLORS_CT[pct] ?? '#aaa', 'stroke-width': 2, fill: RING_COLORS_CT[pct] ?? '#aaa', 'fill-opacity': 0 };
            return ring;
          })),
        ];

        cur = await patchCreatedOp({
          name: mapTitle,
          caltopo_map_id: mapId,
          caltopo_map_url: url,
          caltopo_features: JSON.stringify({ type: 'FeatureCollection', features: snapFeatures }),
        });
        setRollout(r => ({ ...r, caltopo: 'done', caltopoUrl: url }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'CalTopo error';
        setRollout(r => ({ ...r, caltopo: 'error', errors: { ...r.errors, caltopo: msg } }));
      }
    } else {
      setRollout(r => ({
        ...r,
        caltopo: cur.caltopo_map_id ? 'done' : 'skipped',
        caltopoUrl: cur.caltopo_map_url ?? (cur.caltopo_map_id ? `https://caltopo.com/m/${cur.caltopo_map_id}` : undefined),
      }));
    }

    // ── 3. Twilio SMS + Voice Call ───────────────────────────────────────────
    if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
      setRollout(r => ({ ...r, sms: 'running' }));
      try {
        const authToken = localStorage.getItem('sarmanager_session_token') ?? '';
        const agency = cur.tasking_agency ?? 'SAR';
        const age = cur.lost_person_age ? `${cur.lost_person_age}yo` : '';
        const sex = cur.subject_sex ? cur.subject_sex.toLowerCase() : '';
        const profile = ISRID[cur.subject_category ?? '']?.label ?? 'person';
        const subject = [age, sex, profile].filter(Boolean).join(' ');
        const portalUrl = `${window.location.origin}/checkin/${cur.id}`;

        // SMS includes the check-in URL
        const smsMsg = `${agency} SAR callout — missing ${subject}. Check in: ${portalUrl}`.slice(0, 160);
        // Voice call message — no URL (not readable aloud)
        const callMsg = `${agency} SAR callout. Locate missing ${subject}. Please respond immediately to your search manager.`;

        const twilioBase = {
          accountSid: settings.twilioAccountSid,
          authToken: settings.twilioAuthToken,
          fromNumber: settings.twilioFromNumber,
        };

        const [smsRes] = await Promise.all([
          fetch('/api/twilio/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ action: 'sms', ...twilioBase, message: smsMsg }),
          }),
          fetch('/api/twilio/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ action: 'call', ...twilioBase, message: callMsg }),
          }).catch(() => {}), // non-fatal if calls fail
        ]);
        const smsData = await smsRes.json();
        setRollout(r => ({ ...r, sms: 'done', smsCount: (smsData as { sent?: number }).sent ?? 0 }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'SMS/call error';
        setRollout(r => ({ ...r, sms: 'error', errors: { ...r.errors, sms: msg } }));
      }
    } else {
      setRollout(r => ({ ...r, sms: 'skipped' }));
    }

    // ── 4. D4H Whiteboard ────────────────────────────────────────────────────
    if (settings.d4hToken && settings.d4hTeamId) {
      setRollout(r => ({ ...r, whiteboard: 'running' }));
      try {
        const mapUrl = cur.caltopo_map_url ?? (cur.caltopo_map_id ? `https://caltopo.com/m/${cur.caltopo_map_id}` : '');
        const portalUrl = typeof window !== 'undefined'
          ? `${window.location.origin}/checkin/${cur.id}`
          : `/checkin/${cur.id}`;
        await fetch('/api/d4h', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'postWhiteboard',
            token: settings.d4hToken,
            teamId: Number(settings.d4hTeamId),
            title: `🔴 Active Search — ${cur.name}`,
            content: [
              `ACTIVE SEARCH OPERATION`,
              cur.tasking_agency ? `Tasking: ${cur.tasking_agency}` : '',
              cur.oic_name ? `OIC: ${cur.oic_name}` : '',
              mapUrl ? `CalTopo: ${mapUrl}` : '',
              `Check-In Portal: ${portalUrl}`,
              `Started: ${new Date(cur.started_at).toLocaleString()}`,
            ].filter(Boolean).join('\n'),
            pinned: true,
          }),
        });
        setRollout(r => ({ ...r, whiteboard: 'done' }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Whiteboard error';
        setRollout(r => ({ ...r, whiteboard: 'error', errors: { ...r.errors, whiteboard: msg } }));
      }
    } else {
      setRollout(r => ({ ...r, whiteboard: 'skipped' }));
    }

    setRollout(r => ({ ...r, done: true }));
    setRolloutRunning(false);
  }

  const chip = (selected: boolean) =>
    `px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
      selected ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-blue-400'
    }`;

  const dangerChip = (selected: boolean) =>
    `px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
      selected ? 'bg-red-50 text-red-700 border-red-400' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-red-400'
    }`;

  // ── Deploy wizard render (post-creation) ────────────────────────────────

  const STEP_ICON: Record<string, string> = { idle: '○', running: '⟳', done: '✓', error: '✗', skipped: '—' };
  const STEP_COLOR: Record<string, string> = {
    idle: 'border-gray-300 text-gray-500',
    running: 'border-blue-400 text-blue-700 bg-blue-50',
    done: 'border-green-500 text-green-800 bg-green-50',
    error: 'border-red-400 text-red-700 bg-red-50',
    skipped: 'border-gray-200 text-gray-400 bg-gray-50',
  };

  function RolloutStep({ status, label, extra, link }: { status: string; label: string; extra?: string; link?: string }) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${STEP_COLOR[status]}`}>
        <span className="font-mono text-sm w-4 shrink-0">{STEP_ICON[status]}</span>
        <span className="text-sm font-medium flex-1">{label}</span>
        {extra && <span className="text-xs text-gray-500">{extra}</span>}
        {link && status === 'done' && <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">↗ Open</a>}
      </div>
    );
  }

  if (createdOp) {
    const op = createdOp;
    return (
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Op created banner */}
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-green-600 text-lg">✓</span>
          <div>
            <div className="font-semibold text-green-800 text-sm">Operation created</div>
            <div className="text-green-700 text-xs">{op.name}</div>
          </div>
        </div>

        {d4hWarning && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-5 py-3 flex items-start gap-3">
            <span className="text-yellow-600 text-lg shrink-0">⚠</span>
            <div className="text-yellow-800 text-sm">{d4hWarning}</div>
          </div>
        )}

        {/* Decision */}
        {deployMode === 'decide' && (
          <div className="bg-white rounded-xl shadow border-2 border-blue-400 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Decision to Deploy</h2>
            <p className="text-sm text-gray-500 mb-1">
              Tasking from <strong>{op.tasking_agency ?? '—'}</strong>{op.oic_name ? ` via ${op.oic_name}` : ''}.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Subject: <strong>{op.lost_person_name ?? 'Unknown'}</strong>{op.lost_person_age ? `, ${op.lost_person_age}y` : ''}.
              {op.safety_concerns && <span className="text-red-600 ml-1">⚠ {op.safety_concerns.slice(0, 80)}</span>}
            </p>
            <div className="flex gap-3">
              <button onClick={handleDeploy}
                className="flex-1 bg-green-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-green-700 transition-colors">
                ✅ DEPLOY
              </button>
              <button onClick={() => setDeployMode('discuss')}
                className="flex-1 border-2 border-yellow-500 text-yellow-600 py-4 rounded-xl text-lg font-bold hover:bg-yellow-50 transition-colors">
                ⏸ DISCUSS FIRST
              </button>
            </div>
          </div>
        )}

        {/* Discuss */}
        {deployMode === 'discuss' && (
          <div className="bg-white rounded-xl shadow border-2 border-yellow-400 p-6">
            <h2 className="text-lg font-bold text-yellow-600 mb-3">Under Discussion</h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for discussion</label>
            <input value={discussWhy} onChange={e => setDiscussWhy(e.target.value)}
              placeholder="Insufficient resources, weather, jurisdiction…"
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-3">
              <button onClick={handleDeploy}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">
                ✅ Deploy Now
              </button>
              <button onClick={() => onCreated(op)}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                Go to Dashboard →
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">You can initiate deployment from the dashboard later.</p>
          </div>
        )}

        {/* Rollout progress */}
        {deployMode === 'deploy' && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {rollout.done ? 'Operation Ready' : 'Setting up your operation…'}
            </h2>
            <div className="space-y-2">
              <RolloutStep status={rollout.d4h} label={op.d4h_activity_type === 'exercise' ? 'D4H Exercise' : 'D4H Incident'}
                extra={rollout.d4hId ? `#${rollout.d4hId}` : rollout.errors.d4h} />
              <RolloutStep status={rollout.caltopo} label="CalTopo Map"
                extra={rollout.errors.caltopo} link={rollout.caltopoUrl} />
              <RolloutStep status={rollout.sms} label="SMS + Voice Callout"
                extra={rollout.sms === 'done' ? `${rollout.smsCount} texts sent` : rollout.errors.sms} />
              <RolloutStep status={rollout.whiteboard} label="D4H Whiteboard"
                extra={rollout.errors.whiteboard} />
            </div>
            {rollout.done && (() => {
              const portalUrl = `${window.location.origin}/checkin/${createdOp!.id}`;
              return (
                <>
                  <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3">
                    <div className="text-xs font-bold text-green-800 mb-1">Searcher Check-In Link</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono text-green-900 bg-white border border-green-200 rounded px-2 py-1.5 break-all">{portalUrl}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(portalUrl)}
                        className="shrink-0 px-2.5 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors">
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-green-700 mt-1">This URL was included in the Twilio SMS sent to all roster members.</p>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button onClick={() => onCreated(createdOp!)}
                      className="bg-green-600 text-white px-8 py-3 rounded-xl text-base font-bold hover:bg-green-700 transition-colors">
                      Open Dashboard →
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    );
  }

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
              {(settings.taskingAgencies ?? ['RCMP', 'MHPS', 'AHS', 'STARS', 'CJFR', 'Other']).map(a => (
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Police File Number</label>
            <input
              value={form.police_file_number}
              onChange={e => set('police_file_number', e.target.value)}
              placeholder="e.g. 2026-12345"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">Used in op name, CalTopo map title, and D4H incident/exercise name.</p>
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
              apiKey={settings.hereApiKey}
              geocodeCountry={settings.geocodeCountry}
              geocodeRegion={settings.geocodeRegion} />
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
              apiKey={settings.hereApiKey}
              geocodeCountry={settings.geocodeCountry}
              geocodeRegion={settings.geocodeRegion} />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Operation Name
              <span className="text-xs text-gray-400 font-normal ml-1">(D4H # added automatically after creation)</span>
            </label>
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
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Select the deployment presets that apply to this operation. Searchers will see the
            associated equipment and vehicles during check-in.
          </p>

          {presetsLoading && (
            <div className="text-center text-gray-500 py-8 text-sm">Loading presets…</div>
          )}
          {presetsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{presetsError}</div>
          )}
          {!presetsLoading && !presetsError && availablePresets.length === 0 && (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
              No deployment presets configured yet.
              <br />
              <span className="text-gray-400">Go to Equipment → Presets tab to create them.</span>
            </div>
          )}
          {!presetsLoading && availablePresets.length > 0 && (
            <div className="space-y-2">
              {availablePresets.map(preset => {
                const selected = form.deployed_preset_ids.includes(preset.id);
                let items: string[] = [];
                try { items = JSON.parse(preset.items_json ?? '[]'); } catch { /* ignore */ }
                return (
                  <button key={preset.id} type="button" onClick={() => togglePreset(preset.id)}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                      }`}>
                        {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm">{preset.name}</div>
                        {preset.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{preset.description}</div>
                        )}
                        {(items.length > 0 || preset.containers.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {items.map((item, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{item}</span>
                            ))}
                            {preset.containers.map(c => (
                              <span key={c} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">{c}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {form.deployed_preset_ids.length > 0 && (
            <p className="text-sm text-green-700 font-medium">
              {form.deployed_preset_ids.length} preset{form.deployed_preset_ids.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}

      {/* Check-in settings — shown on step 7 alongside preset selection */}
      {step === 7 && (
        <div className="border border-gray-200 rounded-xl p-4 bg-white">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Check-In Settings</div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ipp_direct_disabled}
              onChange={e => set('ipp_direct_disabled', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600 shrink-0"
            />
            <div>
              <div className="text-sm font-medium text-gray-700">Disable "Attend IPP Direct"</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Searchers must claim a vehicle seat — no option to go directly to IPP.
              </div>
            </div>
          </label>
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
              ['File #', form.police_file_number?.trim() || undefined],
              ['Equipment', form.deployed_preset_ids.length ? `${form.deployed_preset_ids.length} preset${form.deployed_preset_ids.length !== 1 ? 's' : ''}` : undefined],
              ['IPP Direct', form.ipp_direct_disabled ? 'Disabled' : undefined],
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
