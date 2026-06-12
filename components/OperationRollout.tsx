'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Operation } from '@/lib/operations-store';

async function apiPatch(opId: string, patch: Partial<Operation>): Promise<Operation | null> {
  const token = localStorage.getItem('sarmanager_session_token') ?? '';
  const res = await fetch(`/api/operations/${opId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.operation ?? null;
}
import { useSettings } from '@/lib/settings-context';
import { useAuth } from '@/lib/auth-context';
import { ISRID, RING_COLORS, circlePolygon } from '@/lib/isrid';
import { formatUTM } from '@/lib/utm';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(dt?: string) {
  return dt ? new Date(dt).toLocaleString('en-CA') : '—';
}

function elapsed(startedAt: string) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { h, m, label: `${h}h ${m}m` };
}

function buildCalloutSMS(op: Operation, checkInUrl?: string): string {
  const age = op.lost_person_age ? `${op.lost_person_age}yo` : '';
  const sex = op.subject_sex ? op.subject_sex.toLowerCase() : '';
  const agency = op.tasking_agency ?? 'SAR';
  const profile = ISRID[op.subject_category ?? '']?.label ?? 'person';
  const subject = [age, sex, profile].filter(Boolean).join(' ');
  const base = `${agency} SAR callout — missing ${subject}. Check in now: `;
  const url = checkInUrl ?? '';
  const msg = `${base}${url}`;
  return msg.slice(0, 150);
}

function buildD4HDescription(op: Operation): string {
  const age = op.lost_person_age ? `${op.lost_person_age}y` : '';
  const sex = op.subject_sex ?? '';
  return [
    `Missing ${[age, sex].filter(Boolean).join(' ')} ${op.lost_person_name ?? 'person'}.`,
    op.subject_circumstance ? `Circumstance: ${op.subject_circumstance.slice(0, 200)}` : '',
    op.tasking_agency ? `Tasking: ${op.tasking_agency}` : '',
    op.oic_name ? `OIC: ${op.oic_name}` : '',
  ].filter(Boolean).join('\n');
}

function buildD4HSecureContent(op: Operation, weatherSummary: string, caltopoUrl: string): string {
  const ipp = op.ipp_type === 'pls'
    ? `PLS: ${op.pls_location ?? ''} ${op.pls_lat ? formatUTM(op.pls_lat, op.pls_lon!) : ''}`
    : `LKP: ${op.last_seen_location ?? ''} ${op.latitude ? formatUTM(op.latitude, op.longitude!) : ''}`;

  return [
    `=== INCIDENT DETAILS ===`,
    `Subject: ${op.lost_person_name ?? '—'}, ${op.lost_person_age ?? '—'}y, ${op.subject_sex ?? '—'}`,
    `Clothing: ${op.subject_clothing ?? '—'}`,
    `Gear: ${op.subject_gear ?? '—'}`,
    `Physical: ${op.lost_person_description ?? '—'}`,
    ``,
    `=== LOCATION ===`,
    `PLS: ${op.pls_location ?? '—'}  ${op.pls_lat ? formatUTM(op.pls_lat, op.pls_lon!) : ''}`,
    `LKP: ${op.last_seen_location ?? '—'}  ${op.latitude ? formatUTM(op.latitude, op.longitude!) : ''}`,
    `IPP: ${ipp}`,
    `Last seen: ${fmt(op.pls_time)}  Reported: ${fmt(op.reported_time)}`,
    ``,
    `=== CONDITION ===`,
    `Circumstance: ${op.subject_circumstance ?? '—'}`,
    `Medical: ${op.subject_condition ?? '—'}`,
    `Terrain: ${op.terrain_type ?? '—'}`,
    `ISRID Profile: ${ISRID[op.subject_category ?? '']?.label ?? '—'}`,
    ``,
    `=== SAFETY ===`,
    op.safety_concerns || 'None noted',
    ``,
    `=== WEATHER ===`,
    weatherSummary || 'Not available',
    ``,
    `=== CALTOPO ===`,
    caltopoUrl || 'Not created',
  ].join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  op: Operation;
  onUpdated: (op: Operation) => void;
}

export default function OperationRollout({ op, onUpdated }: Props) {
  // Always render the dashboard — decision prompt is a dismissable banner inside it
  return <DeployDashboard op={op} onUpdated={onUpdated} />;
}

// ── Decision screen ───────────────────────────────────────────────────────────

function DecisionScreen({ op, onDecide }: { op: Operation; onDecide: (d: 'yes' | 'no') => void }) {
  return (
    <div className="bg-white rounded-xl shadow border-2 border-blue-400 p-6 mb-4">
      <h2 className="text-xl font-bold text-gray-800 mb-2">Decision to Deploy</h2>
      <p className="text-gray-500 text-sm mb-6 leading-relaxed">
        Tasking from <strong>{op.tasking_agency ?? '—'}</strong>{op.oic_name ? ` via ${op.oic_name}` : ''}.{' '}
        Subject: <strong>{op.lost_person_name ?? 'Unknown'}</strong>
        {op.lost_person_age ? `, ${op.lost_person_age}y` : ''}.
        {op.safety_concerns && <span className="text-red-600"> ⚠️ Safety: {op.safety_concerns.slice(0, 100)}</span>}
      </p>
      <div className="flex gap-4">
        <button onClick={() => onDecide('yes')}
          className="flex-1 bg-green-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-green-700 transition-colors">
          ✅ DEPLOY
        </button>
        <button onClick={() => onDecide('no')}
          className="flex-1 border-2 border-yellow-500 text-yellow-600 py-4 rounded-xl text-lg font-bold hover:bg-yellow-50 transition-colors">
          ⏸ DISCUSS FIRST
        </button>
      </div>
    </div>
  );
}

// ── Discuss screen ────────────────────────────────────────────────────────────

function DiscussScreen({ op, onDeploy }: { op: Operation; onDeploy: () => void }) {
  const [why, setWhy] = useState('');
  const [copied, setCopied] = useState(false);

  const msg = [
    `📋 INCIDENT — ${op.tasking_agency ?? 'Unknown Agency'} — ${new Date().toLocaleString()}`,
    `Subject: ${op.lost_person_name ?? '—'}, ${op.lost_person_age ?? '—'}y, ${op.subject_sex ?? '—'}`,
    `Location: ${op.last_seen_location ?? op.pls_location ?? '—'}`,
    `Circumstance: ${op.subject_circumstance?.slice(0, 200) ?? '—'}`,
    `Safety: ${op.safety_concerns || 'None noted'}`,
    why ? `Why discussing: ${why}` : '',
  ].filter(Boolean).join('\n');

  function copy() {
    navigator.clipboard.writeText(msg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div className="bg-white rounded-xl shadow border-2 border-yellow-400 p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-yellow-600">SM Discussion</h2>
        <button onClick={onDeploy} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
          → Decision to Deploy
        </button>
      </div>
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for discussion</label>
        <input value={why} onChange={e => setWhy(e.target.value)}
          placeholder="Insufficient resources, weather, jurisdiction…"
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="bg-gray-50 rounded-lg p-3 mb-3 font-mono text-xs whitespace-pre-wrap leading-relaxed">{msg}</div>
      <button onClick={copy} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
        {copied ? '✓ Copied' : 'Copy Message'}
      </button>
    </div>
  );
}

// ── Deploy dashboard ──────────────────────────────────────────────────────────

type AutoStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

interface AutoState {
  d4hIncident: AutoStatus;
  caltopo: AutoStatus;
  whiteboard: AutoStatus;
  callout: AutoStatus;
  errors: Record<string, string>;
  d4hIncidentId?: string;
  caltopoMapId?: string;
  calloutId?: string;
  weatherSummary?: string;
}

const AUTO0: AutoState = { d4hIncident: 'idle', caltopo: 'idle', whiteboard: 'idle', callout: 'idle', errors: {} };

function DeployDashboard({ op, onUpdated }: { op: Operation; onUpdated: (op: Operation) => void }) {
  const { settings } = useSettings();
  const d4hToken = settings.d4hToken;

  // Decision state — managed locally so the banner can be dismissed without blocking the dashboard
  const [decisionBanner, setDecisionBanner] = useState<'decide' | 'discuss' | 'hidden'>(
    op.deploy_decision === 'yes' ? 'hidden' :
    op.deploy_decision === 'no'  ? 'discuss' : 'decide'
  );
  const [discussWhy, setDiscussWhy] = useState('');
  const [discussCopied, setDiscussCopied] = useState(false);

  async function setDecision(d: 'yes' | 'no') {
    const updated = await apiPatch(op.id, {
      deploy_decision: d,
      deploy_timestamp: new Date().toISOString(),
    });
    if (updated) onUpdated(updated);
    setDecisionBanner(d === 'yes' ? 'hidden' : 'discuss');
  }

  // If the D4H incident/exercise was already created during intake, skip that step
  const alreadyCreated = Boolean(op.d4h_incident_id || op.d4h_exercise_id);
  const [auto, setAuto] = useState<AutoState>({
    ...AUTO0,
    d4hIncident: alreadyCreated ? 'done' : 'idle',
  });
  const [firing, setFiring] = useState(false);
  const [activeTab, setActiveTab] = useState<'board' | 'comms' | 'personnel' | 'imt' | 'opdetails' | 'equipment' | 'operation'>('board');

  const setStatus = useCallback((key: keyof Omit<AutoState, 'errors'>, status: AutoStatus, extra?: Partial<AutoState>) => {
    setAuto(prev => ({ ...prev, [key]: status, ...extra }));
  }, []);

  const setError = useCallback((key: string, msg: string) => {
    setAuto(prev => ({ ...prev, [key]: 'error', errors: { ...prev.errors, [key]: msg } }));
  }, []);

  async function callD4H(action: string, extra: object = {}) {
    const res = await fetch('/api/d4h', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: d4hToken, ...(settings.d4hTeamId ? { teamId: Number(settings.d4hTeamId) } : {}), ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'D4H error');
    return data;
  }

  async function callCaltopo(action: string, extra: object = {}) {
    const res = await fetch('/api/caltopo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        credentialId: settings.credentialId,
        secret: settings.secret,
        accountId: settings.accountId,
        ...extra,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'CalTopo error');
    return data;
  }

  async function runD4HIncident() {
    setStatus('d4hIncident', 'running');
    try {
      // Fetch weather first (best effort)
      let weatherSummary = '';
      const ippLat = op.ipp_type === 'pls' ? op.pls_lat : op.latitude;
      const ippLon = op.ipp_type === 'pls' ? op.pls_lon : op.longitude;
      if (ippLat && ippLon) {
        try {
          const wr = await fetch(`/api/weather?lat=${ippLat}&lon=${ippLon}`);
          if (wr.ok) {
            const wd = await wr.json();
            const c = wd.conditions;
            weatherSummary = [
              c.description,
              c.tempC != null ? `${c.tempC.toFixed(1)}°C` : '',
              c.feelsLikeC != null ? `feels ${c.feelsLikeC.toFixed(1)}°C` : '',
              c.windSpeedKmh != null ? `Wind ${c.windDirection ?? ''} ${c.windSpeedKmh} km/h${c.windGustKmh ? ` G${c.windGustKmh}` : ''}` : '',
              c.visibilityKm != null ? `Vis ${c.visibilityKm.toFixed(1)} km` : '',
            ].filter(Boolean).join(', ');
          }
        } catch { /* ignore */ }
      }

      const d4hMapId = op.caltopo_map_id ?? auto.caltopoMapId;
      const caltopoUrl = d4hMapId ? `https://caltopo.com/m/${d4hMapId}` : '';

      // Build D4H title using the same op-name template as CalTopo
      const albertaDate = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const ippDescForName = (op.ipp_type === 'pls' ? op.pls_location : op.last_seen_location) ?? '';
      const rawLocation = ippDescForName.split(',')[0]?.trim() || 'Location';
      const locationSlug = rawLocation.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
      const nameTemplate = settings.opNameTemplate || '{location}-{date}-{d4h_id}';
      const applyNameTemplate = (d4hId: string) =>
        nameTemplate
          .replace(/\{location\}/g, locationSlug)
          .replace(/\{date\}/g, albertaDate)
          .replace(/\{d4h_id\}/g, d4hId)
          .replace(/\{subject\}/g, op.lost_person_name ?? '')
          .replace(/[-–]{2,}/g, '-')
          .replace(/^[-–\s]+|[-–\s]+$/g, '')
          .trim() || `${locationSlug}-${albertaDate}`;
      const tempTitle = applyNameTemplate('PENDING');
      const isExercise = op.d4h_activity_type === 'exercise';

      const createAction = isExercise ? 'createExercise' : 'createIncident';
      const createResult = await callD4H(createAction, {
        title: tempTitle,
        description: buildD4HDescription(op),
      });

      const activityId: number = isExercise
        ? (createResult.exerciseId ?? createResult.exercise?.id)
        : (createResult.incidentId ?? createResult.incident?.id);

      if (!activityId) throw new Error(`D4H ${createAction} succeeded but returned no ID — response: ${JSON.stringify(createResult).slice(0, 200)}`);

      // Rename with actual D4H ID (non-fatal)
      const finalTitle = applyNameTemplate(String(activityId));
      try {
        const updateAction = isExercise ? 'updateExercise' : 'updateIncident';
        const idKey = isExercise ? 'exerciseId' : 'incidentId';
        await callD4H(updateAction, { [idKey]: activityId, title: finalTitle });
      } catch {
        // Title rename is non-critical
      }

      // Save to operation
      const patch = isExercise
        ? { d4h_exercise_id: String(activityId), weather_snapshot: weatherSummary }
        : { d4h_incident_id: String(activityId), weather_snapshot: weatherSummary };
      const updated = await apiPatch(op.id, patch);
      if (updated) onUpdated(updated);

      setStatus('d4hIncident', 'done', { d4hIncidentId: String(activityId), weatherSummary });
    } catch (e: unknown) {
      setError('d4hIncident', e instanceof Error ? e.message : 'D4H error');
    }
  }

  async function runCaltopo() {
    setStatus('caltopo', 'running');
    try {
      const ippLat = op.ipp_type === 'pls' ? op.pls_lat : op.latitude;
      const ippLon = op.ipp_type === 'pls' ? op.pls_lon : op.longitude;
      if (!ippLat || !ippLon) throw new Error('No IPP coordinates — set UTM in the operation');

      const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
      const d4hId   = op.d4h_incident_id ?? op.d4h_exercise_id;

      const albertaDate = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
      });

      // Reverse geocode the IPP to get the municipality/neighbourhood
      let geoLocation = '';
      try {
        const rgParams = new URLSearchParams({ lat: String(ippLat), lon: String(ippLon) });
        if (settings.hereApiKey?.trim()) rgParams.set('key', settings.hereApiKey.trim());
        const rgRes = await fetch(`/api/geocode?${rgParams}`);
        if (rgRes.ok) geoLocation = ((await rgRes.json()).municipality ?? '').trim();
      } catch { /* non-fatal */ }

      const ippDesc = (op.ipp_type === 'pls' ? op.pls_location : op.last_seen_location) ?? '';
      const rawLocation = geoLocation || ippDesc.split(',')[0]?.trim() || 'Location';
      const locationSlug = rawLocation.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');

      // Apply the op-name template so map title and operation name stay consistent
      const template = settings.opNameTemplate || '{location}-{date}-{d4h_id}';
      const mapTitle = template
        .replace(/\{location\}/g, locationSlug)
        .replace(/\{date\}/g, albertaDate)
        .replace(/\{d4h_id\}/g, d4hId ?? '0000000')
        .replace(/\{subject\}/g, op.lost_person_name ?? '')
        .replace(/[-–]{2,}/g, '-')
        .replace(/^[-–\s]+|[-–\s]+$/g, '')
        .trim() || `${locationSlug}-${albertaDate}`;

      // Folder IDs from template (for routing features to organized layers)
      // Convention: "00 - Critical Incident Info" for markers, "02 - LPB" for rings
      const ippFolderId  = settings.ippFolderId  || undefined;
      const ringFolderId = settings.ringFolderId || undefined;

      // Create the map
      const { mapId, url } = await callCaltopo('createMap', {
        title: mapTitle,
        folderId: settings.folderId || undefined,
      });
      // Save map ID immediately — if feature creation below fails, the ID is still preserved
      { const earlyUpdate = await apiPatch(op.id, { caltopo_map_id: mapId });
        if (earlyUpdate) onUpdated(earlyUpdate); }

      const ippLabel = op.ipp_type === 'pls' ? 'PLS (IPP)' : 'LKP (IPP)';
      const subjectName = op.lost_person_name ?? 'Subject';
      const ippDesc2 = [
        `${op.ipp_type === 'pls' ? 'PLS' : 'LKP'}: ${ippDesc}`,
        op.subject_category ? `Profile: ${profile.label}` : '',
        op.lost_person_age ? `Age: ${op.lost_person_age}` : '',
        op.subject_sex ? `Sex: ${op.subject_sex}` : '',
        op.terrain_type ? `Terrain: ${op.terrain_type}` : '',
        op.subject_clothing ? `Clothing: ${op.subject_clothing}` : '',
        op.subject_condition ? `Medical: ${op.subject_condition}` : '',
        op.subject_circumstance ? `Circumstance: ${op.subject_circumstance?.slice(0, 200)}` : '',
      ].filter(Boolean).join('\n');

      // Add IPP marker — orange-red, matches Electron color scheme
      await callCaltopo('addFeature', {
        mapId,
        folderId: ippFolderId,
        feature: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [ippLon, ippLat] },
          properties: {
            title: `${ippLabel} – ${subjectName}`,
            description: ippDesc2,
            class: 'Marker',
            'marker-color': '#FF6B35',
            'marker-symbol': 'cp',
          },
        },
      });

      // Add secondary marker (LKP when IPP=PLS, or PLS when IPP=LKP)
      if (op.pls_lat && op.pls_lon && op.latitude && op.longitude) {
        const secLat   = op.ipp_type === 'lkp' ? op.pls_lat   : op.latitude;
        const secLon   = op.ipp_type === 'lkp' ? op.pls_lon   : op.longitude;
        const secLabel = op.ipp_type === 'lkp' ? 'PLS'        : 'LKP';
        const secColor = op.ipp_type === 'lkp' ? '#0088FF'    : '#FF00FF';
        const secDesc  = op.ipp_type === 'lkp' ? (op.pls_location ?? 'Point Last Seen') : (op.last_seen_location ?? 'Last Known Point');
        await callCaltopo('addFeature', {
          mapId,
          folderId: ippFolderId,
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [secLon, secLat] },
            properties: { title: `${secLabel} – ${subjectName}`, description: secDesc, class: 'Marker', 'marker-color': secColor },
          },
        });
      }

      // Add default template features
      if (settings.defaultGeoJSON?.features?.length) {
        for (const feature of settings.defaultGeoJSON.features) {
          const gt = (feature as GeoJSON.Feature).geometry?.type;
          if (!['Point', 'LineString', 'Polygon'].includes(gt ?? '')) continue;
          await callCaltopo('addFeature', { mapId, feature });
        }
      }

      // ISRID probability rings — driven by settings.lpbRingPcts
      const RING_COLORS_CT: Record<number, string> = { 25: '#FF0000', 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
      const ringPcts = settings.lpbRingPcts?.length ? settings.lpbRingPcts : [50, 75, 95];
      for (const { pct, km } of profile.distances.filter(d => ringPcts.includes(d.pct))) {
        const ring = circlePolygon(ippLat, ippLon, km);
        ring.properties = {
          title: `${pct}% Probability (${km}km) – ${profile.label}`,
          class: 'Shape',
          stroke: RING_COLORS_CT[pct] ?? RING_COLORS[pct],
          'stroke-width': 2,
          'stroke-opacity': 0.9,
          fill: RING_COLORS_CT[pct] ?? RING_COLORS[pct],
          'fill-opacity': 0,
        };
        await callCaltopo('addFeature', { mapId, folderId: ringFolderId, feature: ring });
      }

      // Build local feature snapshot for Leaflet (avoids re-fetching from CalTopo)
      const localFeatures = buildLocalCaltopoFeatures(op, ippLat, ippLon, profile);
      const caltopoFeatures = JSON.stringify({ type: 'FeatureCollection', features: localFeatures });

      const updated = await apiPatch(op.id, { name: mapTitle, caltopo_map_id: mapId, caltopo_features: caltopoFeatures });
      if (updated) onUpdated(updated);

      setStatus('caltopo', 'done', { caltopoMapId: mapId });
    } catch (e: unknown) {
      setError('caltopo', e instanceof Error ? e.message : 'CalTopo error');
    }
  }

  // Build a minimal local GeoJSON snapshot for Leaflet from current operation data.
  // This lets the Board tab render the map instantly without re-fetching CalTopo.
  function buildLocalCaltopoFeatures(op: Operation, ippLat: number, ippLon: number, profile: typeof ISRID[string]): object[] {
    const features: object[] = [];
    const subjectName = op.lost_person_name ?? 'Subject';
    const ippLabel = op.ipp_type === 'pls' ? 'PLS (IPP)' : 'LKP (IPP)';
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ippLon, ippLat] },
      properties: { title: `${ippLabel} – ${subjectName}`, color: '#FF6B35', class: 'Marker' },
    });
    if (op.pls_lat && op.pls_lon && op.latitude && op.longitude) {
      const secLat = op.ipp_type === 'lkp' ? op.pls_lat  : op.latitude;
      const secLon = op.ipp_type === 'lkp' ? op.pls_lon  : op.longitude;
      const secLabel = op.ipp_type === 'lkp' ? 'PLS'     : 'LKP';
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [secLon, secLat] },
        properties: { title: `${secLabel} – ${subjectName}`, color: op.ipp_type === 'lkp' ? '#0088FF' : '#FF00FF', class: 'Marker' },
      });
    }
    const RING_COLORS_CT: Record<number, string> = { 25: '#FF0000', 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
    const ringPcts = settings.lpbRingPcts?.length ? settings.lpbRingPcts : [50, 75, 95];
    for (const { pct, km } of profile.distances.filter((d: { pct: number }) => ringPcts.includes(d.pct))) {
      const ring = circlePolygon(ippLat, ippLon, km);
      ring.properties = {
        title: `${pct}% Probability (${km}km) – ${profile.label}`,
        stroke: RING_COLORS_CT[pct] ?? '#aaa',
        'stroke-width': 2,
        fill: RING_COLORS_CT[pct] ?? '#aaa',
        'fill-opacity': 0,
      };
      features.push(ring);
    }
    return features;
  }

  async function runWhiteboard() {
    setStatus('whiteboard', 'running');
    try {
      const mapId = op.caltopo_map_id ?? auto.caltopoMapId;
      const mapUrl = mapId ? `https://caltopo.com/m/${mapId}` : '';
      const portalUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/checkin/${op.id}`
        : `/checkin/${op.id}`;
      await callD4H('postWhiteboard', {
        title: `🔴 Active Search — ${op.name}`,
        content: [
          `ACTIVE SEARCH OPERATION`,
          op.tasking_agency ? `Tasking: ${op.tasking_agency}` : '',
          op.oic_name ? `OIC: ${op.oic_name}` : '',
          mapUrl ? `CalTopo: ${mapUrl}` : '',
          `Check-In Portal: ${portalUrl}`,
          `Started: ${new Date(op.started_at).toLocaleString()}`,
        ].filter(Boolean).join('\n'),
        pinned: true,
      });
      setStatus('whiteboard', 'done');
    } catch (e: unknown) {
      setError('whiteboard', e instanceof Error ? e.message : 'Whiteboard error');
    }
  }

  async function runCallout() {
    setStatus('callout', 'running');
    try {
      const checkInUrl = typeof window !== 'undefined' ? `${window.location.origin}/checkin/${op.id}` : `/checkin/${op.id}`;
      const smsMsg  = buildCalloutSMS(op, checkInUrl);

      // Voice message — no URL (not readable aloud)
      const agency  = op.tasking_agency ?? 'SAR';
      const age     = op.lost_person_age ? `${op.lost_person_age}yo` : '';
      const sex     = op.subject_sex ? op.subject_sex.toLowerCase() : '';
      const profile = ISRID[op.subject_category ?? '']?.label ?? 'person';
      const subject = [age, sex, profile].filter(Boolean).join(' ');
      const callMsg = `${agency} SAR callout. Locate missing ${subject}. Please respond immediately to your search manager.`;

      // Twilio SMS + voice call in parallel (if configured)
      if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
        const twilioBase = {
          accountSid: settings.twilioAccountSid,
          authToken: settings.twilioAuthToken,
          fromNumber: settings.twilioFromNumber,
        };
        await Promise.allSettled([
          fetch('/api/twilio/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sms',  ...twilioBase, message: smsMsg }) }),
          fetch('/api/twilio/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'call', ...twilioBase, message: callMsg }) }),
        ]);
      }

      setStatus('callout', 'done');
    } catch (e: unknown) {
      setError('callout', e instanceof Error ? e.message : 'Callout error');
    }
  }


  async function oneClickRollout() {
    setFiring(true);
    // Run each step only if not already skipped by the user
    if (auto.d4hIncident !== 'skipped') await runD4HIncident();
    if (auto.caltopo    !== 'skipped') await runCaltopo();
    await Promise.allSettled([
      auto.whiteboard  !== 'skipped' ? runWhiteboard()  : Promise.resolve(),
      auto.callout     !== 'skipped' ? runCallout()     : Promise.resolve(),
    ]);
    setFiring(false);
  }

  const caltopoMapId = op.caltopo_map_id ?? auto.caltopoMapId;
  const caltopoUrl = caltopoMapId ? `https://caltopo.com/m/${caltopoMapId}` : '';
  const { h, label: elapsedLabel } = elapsed(op.started_at);
  const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
  const ippLat = (op.ipp_type === 'pls' ? op.pls_lat : op.latitude) ?? 0;
  const ippLon = (op.ipp_type === 'pls' ? op.pls_lon : op.longitude) ?? 0;
  const hasCoords = ippLat !== 0 && ippLon !== 0;

  const tabs = [
    { id: 'board',      label: 'Board' },
    { id: 'comms',      label: 'Communications' },
    { id: 'personnel',  label: 'Personnel Management' },
    { id: 'imt',        label: 'IMT Checklists' },
    { id: 'opdetails',  label: 'Operation Details' },
    { id: 'equipment',  label: 'Equipment' },
    { id: 'operation',  label: 'Edit Operation' },
  ] as const;

  return (
    <div>
      {/* Slim op header */}
      <div className="bg-white rounded-xl shadow px-4 py-3 mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-bold text-base truncate ${op.deploy_decision === 'yes' ? 'text-green-700' : 'text-gray-800'}`}>
            {op.deploy_decision === 'yes' ? 'DEPLOYED' : 'ACTIVE'} — {op.name}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Elapsed: <span className={`font-semibold ${h > 6 ? 'text-red-600' : 'text-gray-800'}`}>{elapsedLabel}</span>
            {(op.d4h_incident_id ?? op.d4h_exercise_id) && (
              <span className="ml-3 text-gray-400">D4H #{op.d4h_incident_id ?? op.d4h_exercise_id}</span>
            )}
          </div>
        </div>
        <Link href={`/operations/${op.id}/close`}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
          Close Op
        </Link>
      </div>

      {/* Tab nav */}
      <div className="sar-tabs" style={{ marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`sar-tab ${activeTab === t.id ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BOARD tab ── */}
      {activeTab === 'board' && (
        <div className="space-y-4">
          {hasCoords && <WeatherPanel lat={ippLat} lon={ippLon} hasCoords={hasCoords} compact />}
          <BoardTab op={op} settings={settings} />
        </div>
      )}

      {/* ── COMMUNICATIONS tab ── */}
      {activeTab === 'comms' && (
        <CommunicationsTab op={op} callD4H={callD4H} d4hConfigured={Boolean(d4hToken)} settings={settings} />
      )}

      {/* ── PERSONNEL MANAGEMENT tab ── */}
      {activeTab === 'personnel' && (
        <PersonnelManagementTab op={op} onUpdated={onUpdated} />
      )}

      {/* ── IMT CHECKLISTS tab ── */}
      {activeTab === 'imt' && (
        <IMTChecklistsTab op={op} settings={settings} />
      )}

      {/* ── OPERATION DETAILS tab ── */}
      {activeTab === 'opdetails' && (
        <OperationDetailsTab op={op} onUpdated={onUpdated} elapsedLabel={elapsedLabel} caltopoUrl={caltopoUrl} ippLat={ippLat} ippLon={ippLon} hasCoords={hasCoords} />
      )}

      {/* ── EQUIPMENT tab ── */}
      {activeTab === 'equipment' && (
        <OperationEquipmentPanel op={op} callD4H={callD4H} d4hConfigured={Boolean(d4hToken)} />
      )}

      {/* ── OPERATION EDIT tab ── */}
      {activeTab === 'operation' && (
        <OperationEditTab op={op} onUpdated={onUpdated} />
      )}
    </div>
  );
}

// ── AutoBadge ─────────────────────────────────────────────────────────────────

function AutoBadge({ label, status, error, link, extra, onRun, onSkip, onUnskip }: {
  label: string; status: AutoStatus; error?: string; link?: string; extra?: string;
  onRun: () => void; onSkip: () => void; onUnskip: () => void;
}) {
  const COLOR: Record<AutoStatus, string> = {
    idle:    'border-gray-300 text-gray-600',
    running: 'border-blue-400 text-blue-700 bg-blue-50',
    done:    'border-green-500 text-green-800 bg-green-50',
    error:   'border-red-400 text-red-700 bg-red-50',
    skipped: 'border-gray-300 text-gray-600 bg-gray-50',
  };
  const ICON: Record<AutoStatus, string> = { idle: '○', running: '⟳', done: '✓', error: '✗', skipped: '—' };

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1.5">
        <button onClick={status === 'skipped' ? onUnskip : onRun}
          disabled={status === 'running'}
          title={error ?? (status === 'skipped' ? 'Skipped — click to re-enable' : label)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:cursor-default ${COLOR[status]}`}>
          <span className="font-mono text-xs">{ICON[status]}</span>
          <span className={status === 'skipped' ? 'line-through' : ''}>{label}</span>
          {extra && <span className="text-gray-500 text-xs">{extra}</span>}
        </button>
        {link && status === 'done' && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-medium">↗</a>
        )}
        {status !== 'running' && status !== 'skipped' && (
          <button onClick={onSkip} title="Skip this step"
            className="text-xs text-gray-600 hover:text-gray-600 transition-colors px-1">
            skip
          </button>
        )}
        {status === 'skipped' && (
          <button onClick={onUnskip} title="Re-enable this step"
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors px-1">
            undo
          </button>
        )}
      </div>
      {error && status === 'error' && (
        <div className="text-xs text-red-600 pl-1 max-w-48 truncate" title={error}>{error}</div>
      )}
    </div>
  );
}

// ── RoleTrack ─────────────────────────────────────────────────────────────────

function RoleTrack({ title, color, tasks, opId }: { title: string; color: string; tasks: string[]; opId: string }) {
  const key = `rollout_${opId}_${title}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { return new Set(); }
  });

  function toggle(t: string, v: boolean) {
    setChecked(prev => {
      const next = new Set(prev);
      v ? next.add(t) : next.delete(t);
      localStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 border-t-4" style={{ borderTopColor: color }}>
      <div className="flex justify-between mb-3">
        <div className="font-bold text-base" style={{ color }}>{title}</div>
        <span className="text-sm text-gray-500 font-medium">{checked.size}/{tasks.length}</span>
      </div>
      <div className="space-y-2.5">
        {tasks.map(t => (
          <label key={t} className={`flex items-start gap-2 cursor-pointer ${checked.has(t) ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={checked.has(t)} onChange={e => toggle(t, e.target.checked)} className="mt-0.5 shrink-0 w-4 h-4" />
            <span className={`text-sm leading-snug text-gray-800 ${checked.has(t) ? 'line-through text-gray-500' : ''}`}>{t}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Weather panel ─────────────────────────────────────────────────────────────

function WeatherPanel({ lat, lon, hasCoords, compact }: { lat: number; lon: number; hasCoords: boolean; compact?: boolean }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!hasCoords) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [lat, lon]);

  if (!hasCoords) return (
    <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
      <p>No IPP coordinates — weather requires coordinates.</p>
    </div>
  );

  if (loading && !data) return (
    <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
      <p>Fetching Environment Canada / Open-Meteo data…</p>
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-xl shadow p-6">
      <p className="text-red-500 mb-3">{error}</p>
      <button onClick={load} className="text-sm text-blue-600 hover:underline">Retry</button>
    </div>
  );

  if (!data) return null;
  const c = data.conditions as Record<string, unknown>;
  const forecast = data.forecast as { period: string; tempC: number; precipMm: number; windSpeedKmh: number; description: string }[];
  const alerts = data.alerts as { id: string; severity: string; title: string; issuedAt: string; description: string }[];

  if (compact) {
    return (
      <div className="bg-white rounded-xl shadow px-4 py-2.5 flex items-center gap-4 flex-wrap text-sm">
        {alerts.length > 0 && (
          <span className="text-red-600 font-bold text-xs">{alerts[0].severity.toUpperCase()}: {alerts[0].title.slice(0, 60)}</span>
        )}
        <span className="font-bold text-gray-800">{c.description as string}</span>
        {c.tempC != null && <span className="text-gray-700">{(c.tempC as number).toFixed(1)}°C{c.feelsLikeC != null ? ` (feels ${(c.feelsLikeC as number).toFixed(1)}°)` : ''}</span>}
        {c.windSpeedKmh != null && <span className="text-gray-600">Wind {(c.windDirection as string) ?? ''} {c.windSpeedKmh as number} km/h{c.windGustKmh ? ` G${c.windGustKmh as number}` : ''}</span>}
        {c.visibilityKm != null && <span className="text-gray-500">Vis {(c.visibilityKm as number).toFixed(1)} km</span>}
        <button onClick={load} disabled={loading} className="ml-auto text-xs text-blue-500 hover:underline shrink-0">{loading ? '…' : '↺'}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 space-y-2">
          {alerts.map(a => (
            <div key={a.id} className={`p-3 rounded-lg text-sm border ${a.severity === 'warning' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
              <strong>{a.severity.toUpperCase()}: {a.title}</strong>
              {a.description && <p className="text-xs mt-1 opacity-80">{a.description.slice(0, 200)}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-semibold text-gray-800">Current Conditions</div>
          <button onClick={load} disabled={loading} className="text-xs text-blue-500 hover:underline">{loading ? '…' : 'Refresh'}</button>
        </div>
        <div className="text-3xl font-bold text-gray-900 mb-1">{c.description as string}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          {[
            ['Temperature', c.tempC != null ? `${(c.tempC as number).toFixed(1)}°C` : null],
            ['Feels Like', c.feelsLikeC != null ? `${(c.feelsLikeC as number).toFixed(1)}°C` : null],
            ['Wind', c.windSpeedKmh != null ? `${c.windDirection ?? ''} ${c.windSpeedKmh} km/h${c.windGustKmh ? ` G${c.windGustKmh}` : ''}` : null],
            ['Humidity', c.humidityPct != null ? `${(c.humidityPct as number).toFixed(0)}%` : null],
            ['Visibility', c.visibilityKm != null ? `${(c.visibilityKm as number).toFixed(1)} km` : null],
            ['Pressure', c.pressureKPa != null ? `${(c.pressureKPa as number).toFixed(1)} kPa` : null],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <div className="font-bold text-base text-gray-900">{val}</div>
              <div className="text-sm text-gray-600 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {forecast.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="font-semibold text-gray-800 mb-3">Forecast</div>
          <div className="space-y-3">
            {forecast.map((f) => (
              <div key={f.period} className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-semibold text-sm text-gray-900">{f.period}</div>
                  <div className="text-sm text-gray-600">{f.description} · Wind {f.windSpeedKmh} km/h{f.precipMm > 0 ? ` · ${f.precipMm} mm precip` : ''}</div>
                </div>
                <div className="text-xl font-bold text-gray-900">{f.tempC}°</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-600 text-right px-1">
        Weather data by{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Open-Meteo
        </a>
        {' '}(CC BY 4.0) · EC alerts via{' '}
        <a href="https://weather.gc.ca" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Environment Canada
        </a>
      </div>
    </div>
  );
}

// ── SMEAC briefing ────────────────────────────────────────────────────────────

function SMEACPanel({ op, elapsedLabel, caltopoUrl }: { op: Operation; elapsedLabel: string; caltopoUrl: string }) {
  const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
  const [copied, setCopied] = useState(false);

  const briefing = [
    `=== SMEAC TEAM BRIEFING ===`,
    `${new Date().toLocaleString()} — ${elapsedLabel} since report`,
    ``,
    `SITUATION`,
    `We have been tasked by ${op.tasking_agency ?? '—'} via ${op.oic_name ?? '—'} to locate a missing ${op.lost_person_name ?? 'person'}${op.lost_person_age ? `, ${op.lost_person_age} years old` : ''}.`,
    op.subject_circumstance ? `Circumstances: ${op.subject_circumstance}` : '',
    op.subject_condition ? `Medical: ${op.subject_condition}` : '',
    ``,
    `MISSION`,
    `Search the assigned area and locate the subject. Profile: ${profile.label} — ${profile.notes}`,
    `Search will focus within the ${profile.distances[1].km} km radius of IPP (50% probability zone).`,
    ``,
    `EXECUTION`,
    `IPP: ${op.ipp_type === 'pls' ? (op.pls_location ?? 'PLS') : (op.last_seen_location ?? 'LKP')}`,
    `Subject: ${op.subject_clothing ?? 'clothing not known'}.`,
    `Last seen: ${op.pls_time ? new Date(op.pls_time).toLocaleString() : '—'}`,
    caltopoUrl ? `CalTopo: ${caltopoUrl}` : '',
    ``,
    `ADMINISTRATION`,
    `Report all clues immediately. Photograph and GPS tag everything.`,
    `Do not disturb physical evidence. Maintain track log throughout.`,
    ``,
    `COMMAND & COMMS`,
    `Report to SAR Base on channel _____. Safety officer: _____.`,
    `Check-in every 30 minutes. Emergency signal: _____.`,
    ``,
    `SAFETY`,
    op.safety_concerns ? `Known hazards: ${op.safety_concerns}` : 'No specific hazards identified.',
    `Team leader is responsible for team safety at all times.`,
  ].filter(Boolean).join('\n');

  function copy() {
    navigator.clipboard.writeText(briefing).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-800">SMEAC Team Briefing</h3>
        <button onClick={copy} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-4 leading-relaxed">{briefing}</pre>
    </div>
  );
}

// ── SAR AB panel ──────────────────────────────────────────────────────────────

// Compiled list of SAR AB member groups with approximate centre coordinates
const SAR_AB_TEAMS = [
  { name: 'SEASAR (South Eastern Alberta SAR)', lat: 50.03, lon: -110.67 },
  { name: 'Cypress Hills Rescue Society', lat: 49.57, lon: -110.10 },
  { name: 'Lethbridge & District SAR', lat: 49.70, lon: -112.83 },
  { name: 'Calgary SAR', lat: 51.05, lon: -114.07 },
  { name: 'Banff SAR', lat: 51.18, lon: -115.57 },
  { name: 'Cochrane & Area SAR', lat: 51.19, lon: -114.47 },
  { name: 'Okotoks & District SAR', lat: 50.73, lon: -113.98 },
  { name: 'High River Rescue Society', lat: 50.58, lon: -113.87 },
  { name: 'Brooks Composite Rescue Society', lat: 50.57, lon: -111.90 },
  { name: 'Red Deer SAR', lat: 52.27, lon: -113.81 },
  { name: 'Lacombe & District SAR', lat: 52.47, lon: -113.74 },
  { name: 'Wetaskiwin SAR', lat: 52.97, lon: -113.37 },
  { name: 'Edmonton SAR', lat: 53.54, lon: -113.49 },
  { name: 'Rocky Mountain House SAR', lat: 52.37, lon: -114.92 },
  { name: 'Hinton & District SAR', lat: 53.40, lon: -117.56 },
  { name: 'Grande Cache SAR', lat: 53.88, lon: -119.00 },
  { name: 'Grande Prairie SAR', lat: 55.17, lon: -118.80 },
  { name: 'Peace River SAR', lat: 56.24, lon: -117.29 },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function SARABPanel({ lat, lon, hasCoords }: { lat: number; lon: number; hasCoords: boolean }) {
  if (!hasCoords) return (
    <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
      <p>No IPP coordinates — closest team calculation requires coordinates.</p>
    </div>
  );

  const sorted = SAR_AB_TEAMS
    .map(t => ({ ...t, distKm: Math.round(haversineKm(lat, lon, t.lat, t.lon)) }))
    .sort((a, b) => a.distKm - b.distKm);

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">SAR Alberta — Closest Teams</h3>
        <a href="https://saralberta.ca/member-teams/area-of-operations-map/"
          target="_blank" rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline">
          View SAR AB Map ↗
        </a>
      </div>
      <p className="text-sm text-gray-600 mb-4">Distances are straight-line from IPP. Contact SAR AB for availability.</p>
      <div className="space-y-2">
        {sorted.map((t, i) => (
          <div key={t.name} className={`flex items-center justify-between p-3 rounded-lg ${i === 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3">
              <span className={`font-bold text-sm w-6 text-right ${i === 0 ? 'text-blue-700' : 'text-gray-500'}`}>{i + 1}</span>
              <div>
                <div className={`font-medium text-sm ${i === 0 ? 'text-blue-800' : 'text-gray-800'}`}>{t.name}</div>
                {i === 0 && <div className="text-xs text-blue-600">Nearest mutual aid</div>}
              </div>
            </div>
            <div className={`font-bold text-sm ${i < 3 ? 'text-blue-700' : 'text-gray-500'}`}>{t.distKm} km</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Local news panel ──────────────────────────────────────────────────────────

function LocalNewsPanel({ op }: { op: Operation }) {
  const city = op.last_seen_location?.split(/[\s,]/)[0] ?? 'Medicine Hat';
  const searches = [
    { label: `${city} Herald`, url: `https://medicinehatnews.com/?s=${encodeURIComponent('missing person')}` },
    { label: 'Lethbridge News Now', url: 'https://lethbridgenewsnow.com/category/local-news/' },
    { label: 'CBC Alberta', url: `https://www.cbc.ca/news/canada/calgary?q=${encodeURIComponent('missing person Alberta')}` },
    { label: 'Global News Alberta', url: `https://globalnews.ca/calgary/?q=${encodeURIComponent('missing person')}` },
    { label: 'CTV Calgary', url: 'https://calgary.ctvnews.ca/' },
    { label: 'Alberta SAR Twitter/X', url: 'https://x.com/search?q=missing+person+Alberta&src=typed_query&f=live' },
  ];

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="font-bold text-gray-800 mb-2">Local News & Media</h3>
      <p className="text-sm text-gray-500 mb-4">Monitor for public tip-offs, subject contact, or media inquiries about this incident.</p>
      <div className="space-y-2">
        {searches.map(s => (
          <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group">
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{s.label}</span>
            <span className="text-blue-500 text-sm">↗</span>
          </a>
        ))}
      </div>
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
        If media contact is made, refer to Incident Commander. Do not confirm or deny subject details publicly.
      </div>
    </div>
  );
}

// ── D4H Update panel ──────────────────────────────────────────────────────────

type D4HCallFn = (action: string, extra?: object) => Promise<Record<string, unknown>>;

function D4HUpdatePanel({ op, callD4H, d4hConfigured }: { op: Operation; callD4H: D4HCallFn; d4hConfigured: boolean }) {
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [lastPosted, setLastPosted] = useState('');
  const [error, setError] = useState('');

  async function postUpdate() {
    if (!message.trim()) return;
    setPosting(true); setError('');
    try {
      await callD4H('postUpdate', { incidentId: op.d4h_incident_id, message: message.trim() });
      setLastPosted(new Date().toLocaleTimeString('en-CA'));
      setMessage('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to post update');
    } finally {
      setPosting(false);
    }
  }

  if (!d4hConfigured) {
    return (
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
        <p className="mb-2">D4H token not configured.</p>
        <a href="/settings" className="text-sm text-blue-600 hover:underline">Go to Settings →</a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="font-bold text-gray-800 mb-1">Push Update to D4H</h3>
      <p className="text-sm text-gray-500 mb-4">
        Posts a log entry to the D4H incident{op.d4h_incident_id ? ` #${op.d4h_incident_id}` : ''} and to the D4H whiteboard.
      </p>

      {!op.d4h_incident_id && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          No D4H incident linked. Run the One-Click Rollout first to create the incident.
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Update message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="e.g. Team Alpha deployed to sector 4. Subject's vehicle located at grid 12U 355000E 5610000N. Expanding search perimeter."
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
        />
        <div className="text-xs text-gray-600 mt-1 text-right">{message.length} chars</div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {lastPosted && <p className="text-sm text-green-600 mb-3">✓ Posted at {lastPosted}</p>}

      <div className="flex gap-3">
        <button
          onClick={postUpdate}
          disabled={posting || !message.trim()}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {posting ? 'Posting…' : 'Post to D4H'}
        </button>
        <button
          onClick={() => setMessage('')}
          disabled={posting}
          className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="mt-6 border-t pt-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Quick updates</div>
        <div className="flex flex-wrap gap-2">
          {[
            'Subject located — initiating extraction',
            'Search suspended — weather conditions',
            'Requesting additional resources',
            'Teams returning to base',
            'Transferring command to night IC',
            'Media on scene — refer all inquiries to IC',
          ].map(t => (
            <button
              key={t}
              onClick={() => setMessage(t)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// (SecondCalloutPanel removed — D4H callout not supported)

// ── Inspection result type (mirrors equipment/page.tsx InspResult) ───────────

interface LocalInspResult {
  id: string;
  templateName: string;
  equipmentId: number;
  equipmentName: string;
  completedBy: string;
  completedAt: string;
  fieldResults: { fieldId: string; label: string; value: string | boolean }[];
  overallPassed: boolean;
  operationId?: string;
  operationName?: string;
  d4hSynced?: boolean;
  d4hActivityId?: number;
  d4hSyncedAt?: string;
}

const INSP_RESULTS_KEY = 'sarmanager_insp_results';

function loadLocalInspResults(): LocalInspResult[] {
  try { return JSON.parse(localStorage.getItem(INSP_RESULTS_KEY) ?? '[]'); }
  catch { return []; }
}

function patchLocalInspResult(id: string, patch: Partial<LocalInspResult>) {
  try {
    const all = loadLocalInspResults();
    const idx = all.findIndex(r => r.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...patch };
      localStorage.setItem(INSP_RESULTS_KEY, JSON.stringify(all));
    }
  } catch { /* empty */ }
}

// ── Operation Equipment Panel ─────────────────────────────────────────────────

interface D4HEquipmentItem {
  id: number;
  title: string;
  ref?: string;
  category?: { title?: string };
}

interface DeployPreset {
  id: string;
  name: string;
  description: string;
  items: string[];
  equipmentIds: number[];
}

interface OpEquipLog {
  presetIds: string[];
  itemIds: number[];
}

const DEPLOY_PRESETS_KEY     = 'sarmanager_deploy_presets';
const OP_EQ_LOG_KEY          = 'sarmanager_op_equipment_logs';
const DEPLOY_PRESETS_VERSION = 'sarmanager_deploy_presets_v2'; // bump to clear old hardcoded defaults

function loadDeployPresets(): DeployPreset[] {
  try {
    // One-time migration: clear presets that were saved from old hardcoded DEFAULT_PRESETS
    if (!localStorage.getItem(DEPLOY_PRESETS_VERSION)) {
      localStorage.removeItem(DEPLOY_PRESETS_KEY);
      localStorage.setItem(DEPLOY_PRESETS_VERSION, '1');
      return [];
    }
    const stored = JSON.parse(localStorage.getItem(DEPLOY_PRESETS_KEY) ?? 'null');
    if (Array.isArray(stored)) return stored;
  } catch { /* empty */ }
  return [];
}

function saveDeployPresets(p: DeployPreset[]) {
  localStorage.setItem(DEPLOY_PRESETS_KEY, JSON.stringify(p));
}

function loadOpEquipLog(opId: string): OpEquipLog {
  try {
    const all = JSON.parse(localStorage.getItem(OP_EQ_LOG_KEY) ?? '{}');
    return all[opId] ?? { presetIds: [], itemIds: [] };
  } catch { return { presetIds: [], itemIds: [] }; }
}

function saveOpEquipLog(opId: string, log: OpEquipLog) {
  try {
    const all = JSON.parse(localStorage.getItem(OP_EQ_LOG_KEY) ?? '{}');
    all[opId] = log;
    localStorage.setItem(OP_EQ_LOG_KEY, JSON.stringify(all));
  } catch { /* empty */ }
}

// Server-backed deployment presets section (container-based, from Equipment > Presets tab)
function ServerPresetsSection({ op }: { op: Operation }) {
  const [serverPresets, setServerPresets] = useState<{ id: string; name: string; description?: string; containers: string[] }[]>([]);
  const [deployments, setDeployments]     = useState<{ id: string; preset_id: string; preset_name: string; containers: string[]; deployed_at: string }[]>([]);
  const [loading, setLoading]   = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';
  const authHdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function load() {
    setLoading(true);
    const [pRes, dRes] = await Promise.all([
      fetch('/api/equipment/presets', { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/equipment/operations/${op.id}/deployments`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) { const d = await pRes.json(); setServerPresets(d.presets ?? []); }
    if (dRes.ok) { const d = await dRes.json(); setDeployments(d.deployments ?? []); }
    setLoading(false);
  }

  async function deploy(presetId: string) {
    setDeploying(presetId);
    const res = await fetch(`/api/equipment/operations/${op.id}/deployments`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ presetId }),
    });
    if (res.ok) load();
    setDeploying(null);
  }

  async function undeploy(deploymentId: string) {
    await fetch(`/api/equipment/operations/${op.id}/deployments/${deploymentId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setDeployments(prev => prev.filter(d => d.id !== deploymentId));
  }

  useEffect(() => { load(); }, [op.id]);

  if (loading) return null;
  if (serverPresets.length === 0) return null;

  // Include presets selected during op intake (stored in deployed_presets_json) as deployed
  const intakePresetIds = (() => {
    try { return new Set(JSON.parse((op as any).deployed_presets_json ?? '[]') as string[]); }
    catch { return new Set<string>(); }
  })();
  const deployedPresetIds = new Set([...deployments.map(d => d.preset_id), ...intakePresetIds]);

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden mb-4">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Equipment Presets (Container-Based)</span>
        <button onClick={load} className="text-xs text-gray-400 hover:underline">↺</button>
      </div>
      <div className="p-4 space-y-2">
        {serverPresets.map(p => {
          const isDeployed = deployedPresetIds.has(p.id);
          const deployment = deployments.find(d => d.preset_id === p.id);
          return (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isDeployed ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{p.name}</div>
                {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{p.containers.join(', ') || 'No containers'}</div>
              </div>
              {isDeployed ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Deployed</span>
                  <button onClick={() => undeploy(deployment!.id)} className="text-xs text-gray-400 hover:underline">Undo</button>
                </div>
              ) : (
                <button onClick={() => deploy(p.id)} disabled={deploying === p.id}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {deploying === p.id ? '…' : 'Deploy'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperationEquipmentPanel({ op, callD4H, d4hConfigured }: {
  op: Operation;
  callD4H: D4HCallFn;
  d4hConfigured: boolean;
}) {
  const [presets, setPresets] = useState<DeployPreset[]>(loadDeployPresets);
  const [opLog, setOpLog] = useState<OpEquipLog>(() => loadOpEquipLog(op.id));
  const [logging, setLogging] = useState<Record<string, boolean>>({});
  const [logErrors, setLogErrors] = useState<Record<string, string>>({});

  const [showEquipment, setShowEquipment] = useState(false);
  const [equipment, setEquipment] = useState<D4HEquipmentItem[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [eqError, setEqError] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [loggingItems, setLoggingItems] = useState(false);

  const [showInspections, setShowInspections] = useState(false);
  const [inspResults, setInspResults] = useState<LocalInspResult[]>([]);
  const [pushingInspId, setPushingInspId] = useState<string | null>(null);
  const [inspPushErrors, setInspPushErrors] = useState<Record<string, string>>({});

  const [showManage, setShowManage] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newItems, setNewItems] = useState('');
  const [newEqIds, setNewEqIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editItems, setEditItems] = useState('');
  const [editEqIds, setEditEqIds] = useState<Set<number>>(new Set());

  async function logPreset(preset: DeployPreset) {
    setLogging(prev => ({ ...prev, [preset.id]: true }));
    setLogErrors(prev => ({ ...prev, [preset.id]: '' }));
    try {
      if (d4hConfigured && preset.equipmentIds.length > 0) {
        const activityId = op.d4h_incident_id ? Number(op.d4h_incident_id) : undefined;
        await Promise.allSettled(preset.equipmentIds.map(eqId =>
          callD4H('logEquipmentUsage', {
            equipmentId: eqId,
            notes: `Deployed with "${preset.name}" — operation ${op.name}`,
            activityId,
            date: new Date().toISOString(),
          })
        ));
      }
      const next: OpEquipLog = {
        presetIds: [...new Set([...opLog.presetIds, preset.id])],
        itemIds:   [...new Set([...opLog.itemIds, ...preset.equipmentIds])],
      };
      saveOpEquipLog(op.id, next);
      setOpLog(next);
    } catch (e: unknown) {
      setLogErrors(prev => ({ ...prev, [preset.id]: e instanceof Error ? e.message : 'Failed' }));
    } finally {
      setLogging(prev => ({ ...prev, [preset.id]: false }));
    }
  }

  function unlogPreset(preset: DeployPreset) {
    const next: OpEquipLog = {
      presetIds: opLog.presetIds.filter(id => id !== preset.id),
      itemIds:   opLog.itemIds.filter(id => !preset.equipmentIds.includes(id)),
    };
    saveOpEquipLog(op.id, next);
    setOpLog(next);
  }

  function refreshInspResults() {
    setInspResults(loadLocalInspResults());
  }

  async function pushInspection(insp: LocalInspResult) {
    if (!d4hConfigured) return;
    const activityId = op.d4h_incident_id ? Number(op.d4h_incident_id) : undefined;
    if (!activityId) return;
    setPushingInspId(insp.id);
    setInspPushErrors(prev => ({ ...prev, [insp.id]: '' }));
    try {
      const notes = [
        `Inspection: ${insp.templateName}`,
        `Inspector: ${insp.completedBy}`,
        `Result: ${insp.overallPassed ? 'PASS' : 'FAIL'}`,
        '',
        ...insp.fieldResults.map(f =>
          typeof f.value === 'boolean'
            ? `${f.value ? '✓' : '✗'} ${f.label}`
            : `${f.label}: ${f.value}`
        ),
      ].join('\n');

      await callD4H('logEquipmentUsage', { equipmentId: insp.equipmentId, notes, activityId });
      await callD4H('updateEquipmentStatus', {
        equipmentId: insp.equipmentId,
        status: insp.overallPassed ? 'Operational' : 'Unserviceable',
        notes,
      }).catch(() => {});

      const now = new Date().toISOString();
      patchLocalInspResult(insp.id, {
        operationId: op.id,
        operationName: op.name,
        d4hSynced: true,
        d4hActivityId: activityId,
        d4hSyncedAt: now,
      });
      setInspResults(loadLocalInspResults());
    } catch (e: unknown) {
      setInspPushErrors(prev => ({ ...prev, [insp.id]: e instanceof Error ? e.message : 'Failed' }));
    } finally {
      setPushingInspId(null);
    }
  }

  async function loadEquipment() {
    if (!d4hConfigured) return;
    setLoadingEq(true); setEqError('');
    try {
      const data = await callD4H('getEquipment');
      setEquipment((data.equipment as D4HEquipmentItem[]) ?? []);
    } catch (e: unknown) {
      setEqError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoadingEq(false);
    }
  }

  function toggleEqItem(id: number) {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function logSelectedItems() {
    if (selectedItemIds.size === 0) return;
    setLoggingItems(true);
    try {
      const activityId = op.d4h_incident_id ? Number(op.d4h_incident_id) : undefined;
      await Promise.allSettled([...selectedItemIds].map(eqId =>
        callD4H('logEquipmentUsage', {
          equipmentId: eqId,
          notes: `Deployed for operation ${op.name}`,
          activityId,
          date: new Date().toISOString(),
        })
      ));
      const next: OpEquipLog = {
        presetIds: opLog.presetIds,
        itemIds:   [...new Set([...opLog.itemIds, ...selectedItemIds])],
      };
      saveOpEquipLog(op.id, next);
      setOpLog(next);
      setSelectedItemIds(new Set());
    } finally {
      setLoggingItems(false);
    }
  }

  function saveNewPreset() {
    if (!newName.trim()) return;
    const preset: DeployPreset = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim(),
      items: newItems.split('\n').map(s => s.trim()).filter(Boolean),
      equipmentIds: [...newEqIds],
    };
    const next = [...presets, preset];
    saveDeployPresets(next);
    setPresets(next);
    setNewName(''); setNewDesc(''); setNewItems(''); setNewEqIds(new Set());
    setShowCreate(false);
  }

  function startEdit(preset: DeployPreset) {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditDesc(preset.description);
    setEditItems(preset.items.join('\n'));
    setEditEqIds(new Set(preset.equipmentIds));
    if (equipment.length === 0) loadEquipment();
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    const next = presets.map(p =>
      p.id === editingId
        ? { ...p, name: editName.trim(), description: editDesc.trim(), items: editItems.split('\n').map(s => s.trim()).filter(Boolean), equipmentIds: [...editEqIds] }
        : p
    );
    saveDeployPresets(next);
    setPresets(next);
    setEditingId(null);
  }

  function deletePreset(id: string) {
    const next = presets.filter(p => p.id !== id);
    saveDeployPresets(next);
    setPresets(next);
  }

  function toggleNewEqId(id: number) {
    setNewEqIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleEditEqId(id: number) {
    setEditEqIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const loggedCount = opLog.presetIds.length;

  return (
    <div className="space-y-4">
      {/* ── Server-backed container presets ── */}
      <ServerPresetsSection op={op} />

      {/* ── D4H item-based presets ── */}
      {presets.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500 text-sm">
          <p className="mb-2">No deployment presets yet.</p>
          <button onClick={() => { setShowManage(true); setShowCreate(true); }}
            className="text-blue-600 hover:underline">Create your first preset</button>
        </div>
      ) : (
        <div className="space-y-3">
          {loggedCount > 0 && (
            <div className="text-xs text-gray-500 font-medium px-1">
              {loggedCount} preset{loggedCount !== 1 ? 's' : ''} logged to this operation
            </div>
          )}
          {presets.map(preset => {
            const isLogged  = opLog.presetIds.includes(preset.id);
            const isLogging = logging[preset.id];
            const err       = logErrors[preset.id];
            return (
              <div key={preset.id}
                className={`bg-white rounded-xl shadow p-4 border-l-4 transition-colors ${isLogged ? 'border-green-500' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">{preset.name}</div>
                    {preset.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{preset.description}</div>
                    )}
                    {preset.items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {preset.items.map((item, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item}</span>
                        ))}
                      </div>
                    )}
                    {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {isLogged ? (
                      <>
                        <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">✓ Logged</span>
                        <button onClick={() => unlogPreset(preset)}
                          className="text-xs text-gray-400 hover:text-gray-600">undo</button>
                      </>
                    ) : (
                      <button onClick={() => logPreset(preset)} disabled={isLogging}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {isLogging ? 'Logging…' : 'Log to Op'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Inspection results ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <button
          onClick={() => {
            const next = !showInspections;
            setShowInspections(next);
            if (next) refreshInspResults();
          }}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <span>Inspection Results</span>
          <span className="text-gray-400 text-xs">{showInspections ? '▲' : '▼'}</span>
        </button>

        {showInspections && (() => {
          const linked   = inspResults.filter(r => r.operationId === op.id);
          const pending  = inspResults.filter(r => !r.operationId && !r.d4hSynced);
          const hasIncident = Boolean(op.d4h_incident_id);

          return (
            <div className="border-t border-gray-100 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={refreshInspResults} className="text-xs text-gray-500 hover:underline">↺ Refresh</button>
              </div>

              {!hasIncident && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Run the One-Click Rollout first to create the D4H incident — then you can push inspections.
                </div>
              )}

              {/* Pending inspections not yet linked to any operation */}
              {pending.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Pending ({pending.length}) — not yet synced to D4H
                  </div>
                  <div className="space-y-2">
                    {pending.map(insp => (
                      <div key={insp.id}
                        className="border border-gray-200 rounded-xl p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800">{insp.equipmentName}</div>
                          <div className="text-xs text-gray-500">
                            {insp.templateName} · {insp.completedBy} · {new Date(insp.completedAt).toLocaleString('en-CA')}
                          </div>
                          {inspPushErrors[insp.id] && (
                            <div className="text-xs text-red-600 mt-1">{inspPushErrors[insp.id]}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${insp.overallPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {insp.overallPassed ? 'PASS' : 'FAIL'}
                          </span>
                          <button
                            onClick={() => pushInspection(insp)}
                            disabled={!hasIncident || pushingInspId === insp.id}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {pushingInspId === insp.id ? '…' : 'Push to Op'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inspections already linked to this operation */}
              {linked.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Linked to this operation ({linked.length})
                  </div>
                  <div className="space-y-2">
                    {linked.map(insp => (
                      <div key={insp.id}
                        className={`border rounded-xl p-3 ${insp.overallPassed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800">{insp.equipmentName}</div>
                            <div className="text-xs text-gray-500">
                              {insp.templateName} · {insp.completedBy} · {new Date(insp.completedAt).toLocaleString('en-CA')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${insp.overallPassed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                              {insp.overallPassed ? 'PASS' : 'FAIL'}
                            </span>
                            <span className="text-xs text-blue-600 font-medium">D4H ✓</span>
                          </div>
                        </div>
                        <div className="mt-2 space-y-0.5">
                          {insp.fieldResults.map(f => (
                            <div key={f.fieldId} className="flex items-center gap-1.5 text-xs text-gray-700">
                              {typeof f.value === 'boolean' ? (
                                <span className={f.value ? 'text-green-600' : 'text-red-600'}>{f.value ? '✓' : '✗'}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                              <span>{f.label}</span>
                              {typeof f.value !== 'boolean' && f.value && <span className="text-gray-500">: {String(f.value)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pending.length === 0 && linked.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-4">
                  No inspection results yet. Complete inspections on the Equipment page.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Browse individual equipment (hidden by default) ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <button
          onClick={() => {
            const next = !showEquipment;
            setShowEquipment(next);
            if (next && equipment.length === 0) loadEquipment();
          }}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <span>Browse individual equipment</span>
          <span className="text-gray-400 text-xs">{showEquipment ? '▲' : '▼'}</span>
        </button>

        {showEquipment && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {!d4hConfigured && (
              <p className="text-sm text-gray-500">
                D4H not configured — <a href="/settings" className="text-blue-600 hover:underline">add token in Settings</a>.
              </p>
            )}
            {d4hConfigured && loadingEq && (
              <div className="text-center text-gray-500 text-sm py-4">Loading from D4H…</div>
            )}
            {eqError && <p className="text-sm text-red-600">{eqError}</p>}
            {d4hConfigured && !loadingEq && equipment.length > 0 && (
              <>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  {equipment.map((item, i) => {
                    const alreadyLogged = opLog.itemIds.includes(item.id);
                    return (
                      <label key={item.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${alreadyLogged ? 'bg-green-50' : selectedItemIds.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                        <input type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          disabled={alreadyLogged}
                          onChange={() => toggleEqItem(item.id)}
                          className="w-4 h-4 accent-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                          {(item.ref || item.category?.title) && (
                            <div className="text-xs text-gray-500">{[item.ref, item.category?.title].filter(Boolean).join(' · ')}</div>
                          )}
                        </div>
                        {alreadyLogged && <span className="text-xs text-green-600 font-medium shrink-0">✓ logged</span>}
                      </label>
                    );
                  })}
                </div>
                {selectedItemIds.size > 0 && (
                  <button onClick={logSelectedItems} disabled={loggingItems}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {loggingItems ? 'Logging…' : `Log ${selectedItemIds.size} item${selectedItemIds.size !== 1 ? 's' : ''} to Operation`}
                  </button>
                )}
                <button onClick={loadEquipment} disabled={loadingEq}
                  className="text-xs text-gray-500 hover:underline">↺ Refresh list</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Manage presets (hidden by default) ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <button
          onClick={() => {
            const next = !showManage;
            setShowManage(next);
            if (next && equipment.length === 0) loadEquipment();
          }}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <span>Manage presets</span>
          <span className="text-gray-400 text-xs">{showManage ? '▲' : '▼'}</span>
        </button>

        {showManage && (
          <div className="border-t border-gray-100 p-4 space-y-2">
            {presets.map(p =>
              editingId === p.id ? (
                <PresetForm key={p.id}
                  title="Edit Preset"
                  name={editName} onName={setEditName}
                  desc={editDesc} onDesc={setEditDesc}
                  items={editItems} onItems={setEditItems}
                  eqIds={editEqIds} onToggleEq={toggleEditEqId}
                  equipment={equipment} loadingEq={loadingEq}
                  d4hConfigured={d4hConfigured}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  saveDisabled={!editName.trim()}
                />
              ) : (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {p.items.length > 0 && `${p.items.length} item${p.items.length !== 1 ? 's' : ''}`}
                      {p.equipmentIds.length > 0 && ` · ${p.equipmentIds.length} D4H asset${p.equipmentIds.length !== 1 ? 's' : ''} linked`}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(p)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deletePreset(p.id); }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </div>
                </div>
              )
            )}

            {showCreate ? (
              <PresetForm
                title="New Preset"
                name={newName} onName={setNewName}
                desc={newDesc} onDesc={setNewDesc}
                items={newItems} onItems={setNewItems}
                eqIds={newEqIds} onToggleEq={toggleNewEqId}
                equipment={equipment} loadingEq={loadingEq}
                d4hConfigured={d4hConfigured}
                onSave={saveNewPreset}
                onCancel={() => { setShowCreate(false); setNewName(''); setNewDesc(''); setNewItems(''); setNewEqIds(new Set()); }}
                saveDisabled={!newName.trim()}
              />
            ) : (
              !editingId && (
                <button onClick={() => { setShowCreate(true); if (equipment.length === 0) loadEquipment(); }}
                  className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors mt-2">
                  + New Preset
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── LPB (Lost Person Behaviour) panel ────────────────────────────────────────

const BASE_INTERVIEW_QUESTIONS = [
  'Full name, date of birth, home address?',
  'When and where was the subject last seen? By whom?',
  'What was the subject wearing / carrying?',
  'Does the subject have a cell phone? Last call/ping location?',
  'Who else should be notified? Next of kin?',
  'Has the subject been reported missing before?',
];

const PROFILE_INTERVIEW_QUESTIONS: Record<string, string[]> = {
  hiker:             ['What was the stated destination or intention?', 'Is the subject familiar with this area?', "What is the subject's experience level?", 'Any planned waypoints or campsites?'],
  camper:            ['What was the campsite or route plan?', 'What gear did they carry?', 'Any experience with this area?'],
  child_1_3:         ['Was there adult supervision nearby?', 'Are there any water sources nearby?', 'Who was the last adult to see the child?'],
  child_4_6:         ['Were there any playmates last seen with?', 'Are there favorite hiding spots nearby?', 'Does the child respond to their name from strangers?'],
  child_7_12:        ['Were friends or companions with them?', 'Any favorite outdoor locations nearby?', 'Has the child expressed interest in specific areas?'],
  dementia:          ['Does the subject have a familiar destination they often walk toward?', 'How long since last medication?', 'What familiar landmarks or roads might they seek?', "What is their mobility level?"],
  despondent:        ['Have there been recent personal/financial/family stressors?', 'Has the subject made any threats of self-harm?', 'Does the subject have access to a vehicle?', 'Has the subject researched any specific locations?'],
  mental_illness:    ['What medications are they on and when were they last taken?', 'Have they been hospitalized recently?', 'Are there known triggers or crisis patterns?'],
  mentally_disabled: ['Who are their support workers or caregivers?', 'Are there familiar routes or daily routines?', 'Do they respond to their name?'],
  substance:         ['What substances are involved?', 'When did they last use?', 'Are they potentially combative?'],
  hunter:            ['What type of hunting? What game?', 'What specific area were they hunting?', 'Was there a vehicle at a trailhead or access road?'],
  climber:           ['What was the specific climb or route objective?', 'What technical gear did they carry?', 'Were there other climbing parties nearby?'],
  skier:             ['Which runs or backcountry routes were planned?', 'Did they have an avalanche beacon, probe, and shovel?'],
  mountain_biker:    ['Which specific trails? Was there a planned route?', 'Was protective gear worn?'],
  horseback:         ['What was the planned route?', 'Where was the horse last seen?', 'Was the rider an experienced equestrian?'],
};

function LPBPanel({ op, onUpdated, elapsedLabel }: { op: Operation; onUpdated: (op: Operation) => void; elapsedLabel: string }) {
  const [localCat, setLocalCat] = useState(op.subject_category ?? 'hiker');
  const [saving, setSaving]     = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';

  const profile = ISRID[localCat] ?? ISRID.hiker;
  const profileQs = PROFILE_INTERVIEW_QUESTIONS[localCat] ?? [];
  const allQs = [...BASE_INTERVIEW_QUESTIONS, ...profileQs];

  async function saveProfile() {
    setSaving(true);
    const res = await fetch(`/api/operations/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject_category: localCat }),
    });
    if (res.ok) { const d = await res.json(); if (d.operation) onUpdated(d.operation); }
    setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* Profile selector */}
      <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-gray-700 shrink-0">ISRID Profile:</label>
        <select value={localCat} onChange={e => setLocalCat(e.target.value)}
          className="flex-1 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {Object.entries(ISRID).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
        </select>
        <button onClick={saveProfile} disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
        {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile card */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{profile.emoji}</span>
            <div>
              <div className="font-bold text-lg">{profile.label}</div>
              <div className="text-xs text-gray-400">{localCat} · ISRID Profile</div>
            </div>
          </div>
          <p className="text-sm text-gray-700 mb-4 leading-relaxed">{profile.notes}</p>

          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Probability Ring Distances</div>
            <div className="space-y-1.5">
              {profile.distances.map(d => (
                <div key={d.pct} className="flex items-center gap-2">
                  <div className="w-10 text-right text-xs font-bold" style={{ color: RING_COLORS[d.pct] }}>{d.pct}%</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.km / 20) * 100)}%`, background: RING_COLORS[d.pct] }} />
                  </div>
                  <div className="w-16 text-xs font-semibold text-gray-700">{d.km} km</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">Radius from IPP (ISRID data).</p>
          </div>
        </div>

        {/* Subject summary + team briefing */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="font-semibold text-sm text-gray-800 mb-3">Subject Summary</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {[
                ['Name', op.lost_person_name],
                ['Age', op.lost_person_age ? `${op.lost_person_age}y` : undefined],
                ['Sex', op.subject_sex],
                ['Clothing', op.subject_clothing],
                ['Gear', op.subject_gear],
                ['Medical', op.subject_condition],
                ['Terrain', op.terrain_type],
                ['Elapsed', elapsedLabel],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="text-gray-500 font-medium">{k}</span>
                  <span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <div className="font-semibold text-sm text-gray-800 mb-3">Team Briefing Template</div>
            <div className="text-sm leading-relaxed space-y-1 text-gray-700">
              <p><strong>Subject:</strong> {op.lost_person_name ?? '?'}, {op.lost_person_age ?? '?'}y {op.subject_sex ?? ''}</p>
              <p><strong>Clothing:</strong> {op.subject_clothing ?? 'Unknown'}</p>
              <p><strong>Circumstance:</strong> {op.subject_circumstance ?? 'Unknown'}</p>
              <p><strong>Medical:</strong> {op.subject_condition || 'None noted'}</p>
              <p><strong>Profile:</strong> {profile.label} — {profile.notes}</p>
              <p><strong>Safety:</strong> {op.safety_concerns || 'None identified'}</p>
              <p className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-semibold">
                Radio check every 60 minutes. Report to SM before entry and on exit from search area.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* All profiles quick reference */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="font-semibold text-sm text-gray-800 mb-3">All Profiles — 50% Distance Reference</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ISRID).map(([id, p]) => (
            <button key={id} onClick={() => setLocalCat(id)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${id === localCat ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'}`}>
              {p.label} — {p.distances.find(d => d.pct === 50)?.km ?? '?'} km
            </button>
          ))}
        </div>
      </div>

      {/* Interview questions */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="font-semibold text-sm text-gray-800 mb-3">Interview Questions — {profile.label}</div>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          {allQs.map((q, i) => <li key={i}>{q}</li>)}
        </ol>
      </div>
    </div>
  );
}

// ── Board tab ─────────────────────────────────────────────────────────────────

interface CheckIn {
  id: string; searcher_name: string; fit_for_field: number;
  drop_dead_time: string; checked_in_at: string; vehicle_role?: string;
  vehicle_name?: string; last_heard_at?: string; inspection_submitted?: number;
}
interface VehicleClaim {
  id: string; vehicle_id: string; vehicle_name: string;
  role: 'driver' | 'passenger'; searcher_name: string;
}
interface TaskWithAssignments {
  id: string; name: string; task_number?: string; status: string;
  task_type?: string; description?: string;
  search_type?: string; team_type?: string;
  current_assignment?: string; planned_tasks?: string;
  assignments: { id: string; personnel_id: string; is_team_leader: number; name: string }[];
}

function radioStatus(lastHeardAt?: string, yellowMins = 45, redMins = 60): { color: string; mins: number } {
  if (!lastHeardAt) return { color: 'bg-gray-300', mins: 999 };
  const mins = Math.max(0, Math.round((Date.now() - new Date(lastHeardAt).getTime()) / 60000));
  if (mins > redMins)    return { color: 'bg-red-500',    mins };
  if (mins > yellowMins) return { color: 'bg-yellow-400', mins };
  return { color: 'bg-green-400', mins };
}

const SM_CHECKLIST = [
  { key: 'callout_sent',    label: 'Callout sent' },
  { key: 'caltopo_pub',     label: 'CalTopo map published' },
  { key: 'd4h_incident',    label: 'D4H incident created' },
  { key: 'cp_established',  label: 'Command post established' },
  { key: 'teams_briefed',   label: 'Teams briefed' },
  { key: 'demob',           label: 'Demob complete' },
];

function BoardTab({ op, settings }: { op: Operation; settings: ReturnType<typeof useSettings>['settings']; }) {
  const yellowMins = settings.radioCheckYellowMins ?? 45;
  const redMins    = settings.radioCheckRedMins    ?? 60;
  const ippLat = (op.ipp_type === 'pls' ? op.pls_lat : op.latitude) ?? 0;
  const ippLon = (op.ipp_type === 'pls' ? op.pls_lon : op.longitude) ?? 0;
  const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
  const { user } = useAuth();
  const isSM = user?.role === 'sm' || user?.role === 'admin';
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [tasks, setTasks]       = useState<TaskWithAssignments[]>([]);
  const [vehicleClaims, setVehicleClaims] = useState<VehicleClaim[]>([]);
  const [features, setFeatures] = useState<unknown[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError]     = useState('');
  const [lastMapRefresh, setLastMapRefresh] = useState<Date | null>(null);
  // SM Checklist + Planning Notes stored in localStorage per operation
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [planningNotes, setPlanningNotes] = useState('');
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';
  const clKey  = `sar_checklist_${op.id}`;
  const pnKey  = `sar_planning_${op.id}`;

  useEffect(() => {
    try { setChecklist(JSON.parse(localStorage.getItem(clKey) ?? '{}')); } catch { /* */ }
    setPlanningNotes(localStorage.getItem(pnKey) ?? '');
  }, [op.id]);

  function setCheck(key: string, val: boolean) {
    const next = { ...checklist, [key]: val };
    setChecklist(next);
    localStorage.setItem(clKey, JSON.stringify(next));
  }
  function savePlanning(v: string) {
    setPlanningNotes(v);
    localStorage.setItem(pnKey, v);
  }

  async function loadBoard() {
    const [ciRes, taskRes] = await Promise.all([
      fetch(`/api/checkin/list?operationId=${op.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/tasks?operation_id=${op.id}`,       { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (ciRes.ok)   { const d = await ciRes.json();   setCheckins(d.checkins ?? []); setVehicleClaims(d.vehicles ?? []); }
    if (taskRes.ok) { const d = await taskRes.json();  setTasks(d.tasks ?? []); }
  }


  async function heardMember(checkinId: string) {
    const now = new Date().toISOString();
    await fetch(`/api/checkin/${checkinId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ last_heard_at: now }),
    });
    setCheckins(prev => prev.map(c => c.id === checkinId ? { ...c, last_heard_at: now } : c));
  }

  async function heardTeam(task: TaskWithAssignments) {
    const teamCheckins = checkins.filter(c =>
      task.assignments.some(a => a.name.toLowerCase() === c.searcher_name.toLowerCase())
    );
    await Promise.all(teamCheckins.map(c => heardMember(c.id)));
  }

  async function loadMap() {
    if (!op.caltopo_map_id) return;
    setLoadingMap(true); setMapError('');
    try {
      const res = await fetch('/api/caltopo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getMapFeatures',
          credentialId: settings.credentialId,
          secret: settings.secret,
          accountId: settings.accountId,
          mapId: op.caltopo_map_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load map');
      if (data.features?.length > 0) setFeatures(data.features);
      setLastMapRefresh(new Date());
      setMapError('');
    } catch (e: unknown) {
      setMapError(e instanceof Error ? e.message : 'Map load failed');
    } finally {
      setLoadingMap(false);
    }
  }

  // Auto-refresh member list every 60 s so radio-check timers stay current
  // If we have a local snapshot already, use it immediately without hitting CalTopo API
  useEffect(() => {
    loadBoard();
    // Priority 1: stored local snapshot
    let gotSnapshot = false;
    if ((op as any).caltopo_features) {
      try {
        const parsed = JSON.parse((op as any).caltopo_features);
        const snapshotFeatures = parsed?.features ?? [];
        if (snapshotFeatures.length > 0) { setFeatures(snapshotFeatures); gotSnapshot = true; }
      } catch { /* fall through */ }
    }
    // Priority 2: rebuild IPP marker + rings from op data so map is never blank
    if (!gotSnapshot && op.caltopo_map_id) {
      const ippLat = op.ipp_type === 'pls' ? op.pls_lat : op.latitude;
      const ippLon = op.ipp_type === 'pls' ? op.pls_lon : op.longitude;
      if (ippLat && ippLon) {
        const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
        const subjectName = op.lost_person_name ?? 'Subject';
        const ippLabel = op.ipp_type === 'pls' ? 'PLS (IPP)' : 'LKP (IPP)';
        const fallbackFeatures: object[] = [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [ippLon, ippLat] },
            properties: { title: `${ippLabel} – ${subjectName}`, color: '#FF6B35', class: 'Marker' } },
        ];
        const RING_COLORS: Record<number, string> = { 25: '#FF0000', 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
        const ringPcts = settings.lpbRingPcts?.length ? settings.lpbRingPcts : [50, 75, 95];
        for (const { pct, km } of profile.distances.filter((d: { pct: number }) => ringPcts.includes(d.pct))) {
          const ring = circlePolygon(ippLat, ippLon, km);
          ring.properties = { title: `${pct}% (${km}km)`, stroke: RING_COLORS[pct] ?? '#aaa', 'stroke-width': 2, fill: RING_COLORS[pct] ?? '#aaa', 'fill-opacity': 0 };
          fallbackFeatures.push(ring);
        }
        setFeatures(fallbackFeatures);
      }
    }
    loadMap();
  }, [op.id, op.caltopo_map_id]);
  useEffect(() => {
    // Re-fetch board every 15s so new check-ins appear promptly
    const t = setInterval(() => loadBoard(), 15000);
    return () => clearInterval(t);
  }, [op.id]);

  // Poll CalTopo every 30 s for live map updates (teams, waypoints, etc.)
  useEffect(() => {
    if (!op.caltopo_map_id) return;
    const t = setInterval(() => loadMap(), 30000);
    return () => clearInterval(t);
  }, [op.caltopo_map_id]);

  const assignedNames = new Set(tasks.flatMap(t => t.assignments.map(a => a.name.toLowerCase())));
  const fieldMembers  = checkins.filter(c => c.fit_for_field);
  const baseMembers   = checkins.filter(c => !c.fit_for_field);

  const [MapComponent, setMapComponent] = useState<React.ComponentType<{ features: unknown[] }> | null>(null);
  useEffect(() => {
    import('./CalTopoMap').then(m => setMapComponent(() => m.default as React.ComponentType<{ features: unknown[] }>));
  }, []);

  return (
    <div className="flex gap-3" style={{ minHeight: 560 }}>
      {/* ── Left: member list (260px) ── */}
      <div className="shrink-0 bg-white rounded-xl shadow flex flex-col overflow-hidden" style={{ width: 260 }}>
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">On Scene ({checkins.length})</span>
          <button onClick={loadBoard} className="text-xs text-blue-500 hover:underline">↺</button>
        </div>
        <div className="flex-1 overflow-y-auto text-sm">
          {tasks.map(t => {
            const members = checkins.filter(c =>
              t.assignments.some(a => a.name.toLowerCase() === c.searcher_name.toLowerCase())
            );
            if (members.length === 0) return null;
            return (
              <div key={t.id}>
                <div className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 border-b border-t flex items-center gap-1">
                  <span className="flex-1 truncate">{t.task_number ? `${t.task_number} — ` : ''}{t.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    t.status === 'deployed' ? 'bg-green-100 text-green-700' :
                    t.status === 'returned' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'}`}>{t.status}</span>
                </div>
                {members.map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} yellowMins={yellowMins} redMins={redMins} />)}
              </div>
            );
          })}
          {fieldMembers.filter(c => !assignedNames.has(c.searcher_name.toLowerCase())).length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-t">Unassigned</div>
              {fieldMembers.filter(c => !assignedNames.has(c.searcher_name.toLowerCase()))
                .map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} yellowMins={yellowMins} redMins={redMins} />)}
            </>
          )}
          {baseMembers.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-t">Base ({baseMembers.length})</div>
              {baseMembers.map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} isBase yellowMins={yellowMins} redMins={redMins} />)}
            </>
          )}
          {checkins.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-xs">No searchers checked in yet.</div>
          )}
        </div>
      </div>

      {/* ── Center: CalTopo map ── */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 shrink-0 gap-3">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide truncate">
            {op.caltopo_map_id ? `CalTopo — ${op.caltopo_map_id}` : 'CalTopo Map'}
          </span>
          <div className="flex gap-2 shrink-0 items-center">
            {op.caltopo_map_id && <>
              {lastMapRefresh && !loadingMap && (
                <span className="text-xs text-gray-400">
                  {lastMapRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button onClick={loadMap} disabled={loadingMap} className="text-xs text-blue-500 hover:underline">
                {loadingMap ? '…' : '↺ Refresh'}
              </button>
              <button onClick={async () => {
                try {
                  await fetch('/api/caltopo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'refreshMarkers',
                      credentialId: settings.credentialId,
                      secret: settings.secret,
                      accountId: settings.accountId,
                      mapId: op.caltopo_map_id,
                      ippSymbol: 'cp',
                    }),
                  });
                  loadMap();
                } catch { /* non-fatal */ }
              }} className="text-xs text-gray-500 hover:underline" title="Update IPP/LKP/PLS marker symbols">
                Update markers
              </button>
              <button onClick={() => navigator.clipboard.writeText(`https://caltopo.com/m/${op.caltopo_map_id!}`)}
                className="text-xs text-blue-500 hover:underline">Copy link</button>
              <a href={`https://caltopo.com/m/${op.caltopo_map_id}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline">Open ↗</a>
            </>}
          </div>
        </div>
        <div className="flex-1 relative">
          {!op.caltopo_map_id && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 p-6 text-center">
              <p className="text-sm font-medium">No CalTopo map yet</p>
              <p className="text-xs text-gray-400">Use the Rollout tab → One-Click Rollout to publish the IPP marker + ISRID rings.</p>
            </div>
          )}
          {op.caltopo_map_id && loadingMap && features.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading map features…</div>
          )}
          {op.caltopo_map_id && mapError && features.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
              <p className="text-red-500 text-sm">{mapError}</p>
              <button onClick={loadMap} className="text-xs text-blue-600 hover:underline">Retry</button>
            </div>
          )}
          {op.caltopo_map_id && features.length > 0 && MapComponent && (
            <MapComponent features={features} />
          )}
          {op.caltopo_map_id && !loadingMap && !mapError && features.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-sm">Map loaded but no features found.</p>
              <button onClick={loadMap} className="text-xs text-blue-600 hover:underline">Reload</button>
            </div>
          )}
        </div>
        {/* CalTopo link with QR hover */}
        {op.caltopo_map_id && (
          <CalTopoLinkBar mapId={op.caltopo_map_id} />
        )}
      </div>

      {/* ── Right widgets (230px) ── */}
      <div className="shrink-0 space-y-3 overflow-y-auto" style={{ width: 230 }}>
        {/* Critical Info */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Critical Info</div>
          <div className="space-y-2 text-xs">
            {/* Time since last radio check scene-wide */}
            {(() => {
              // "Last heard" = time since subject was last seen (PLS time)
              const plsMs = op.pls_time ? new Date(op.pls_time).getTime() : null;
              const minsSincePLS = plsMs ? Math.round((Date.now() - plsMs) / 60000) : null;
              const h = minsSincePLS != null ? Math.floor(minsSincePLS / 60) : null;
              const m = minsSincePLS != null ? minsSincePLS % 60 : null;
              const label = h != null ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : '—';
              const color = minsSincePLS == null ? 'text-gray-400'
                : minsSincePLS > 180 ? 'text-red-600 font-bold'
                : minsSincePLS > 60 ? 'text-yellow-600 font-semibold'
                : 'text-green-700 font-semibold';
              return (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Subject last heard</span>
                  <span className={color}>{label}</span>
                </div>
              );
            })()}
            {/* IPP in UTM */}
            <div>
              <div className="text-gray-500 mb-0.5">IPP (UTM)</div>
              <div className="font-mono text-gray-800 text-xs leading-snug break-all">
                {ippLat && ippLon ? formatUTM(ippLat, ippLon) : '—'}
              </div>
            </div>
            {/* LPB Profile */}
            <div className="flex justify-between items-start gap-1">
              <span className="text-gray-500 shrink-0">LPB Profile</span>
              <span className="font-semibold text-gray-800 text-right">{profile.label}</span>
            </div>
            <div className="text-gray-400 text-xs space-y-0.5">
              {[25, 50, 75, 95].map(pct => {
                const d = profile.distances.find((d: { pct: number }) => d.pct === pct);
                return d ? (
                  <div key={pct} className="flex justify-between">
                    <span>{profile.emoji} {pct}%</span>
                    <span className="font-mono">{d.km} km</span>
                  </div>
                ) : null;
              })}
            </div>
            {/* Personnel counts */}
            <div className="border-t pt-2 flex justify-between">
              <span className="text-gray-500">On scene</span>
              <span className="font-semibold text-gray-800">{fieldMembers.length} field · {baseMembers.length} base</span>
            </div>
          </div>
        </div>

        {/* Team Status */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Team Status</div>
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-400">No teams yet — use Personnel Management.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const teamCheckins = checkins.filter(c =>
                  t.assignments.some(a => a.name.toLowerCase() === c.searcher_name.toLowerCase())
                );
                const worstMins = teamCheckins.length
                  ? Math.max(...teamCheckins.map(c => radioStatus(c.last_heard_at, yellowMins, redMins).mins))
                  : 999;
                const borderColor = worstMins > redMins ? 'border-red-400' : worstMins > yellowMins ? 'border-yellow-400' : worstMins < 999 ? 'border-green-400' : 'border-gray-200';
                const textColor   = worstMins > redMins ? 'text-red-600 font-bold' : worstMins > yellowMins ? 'text-yellow-600' : 'text-gray-400';
                return (
                  <div key={t.id} className={`border rounded-lg p-2 ${borderColor}`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-gray-800 truncate flex-1">{t.name}</span>
                      <span className={`text-xs font-mono shrink-0 ${textColor}`}>
                        {worstMins < 999 ? `${worstMins}m` : '—'}
                      </span>
                    </div>
                    {t.current_assignment && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">▶ {t.current_assignment}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        t.status === 'deployed' ? 'bg-green-100 text-green-700' :
                        t.status === 'returned' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'}`}>{t.status}</span>
                      <button onClick={() => heardTeam(t)}
                        className="text-xs text-blue-600 hover:underline">✓ Heard</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Vehicles */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Vehicles</div>
          {(() => {
            const byVehicle = new Map<string, { name: string; driver?: string; passengers: string[]; inspected: boolean }>();
            for (const claim of vehicleClaims) {
              if (!byVehicle.has(claim.vehicle_id)) {
                byVehicle.set(claim.vehicle_id, { name: claim.vehicle_name, passengers: [], inspected: false });
              }
              const v = byVehicle.get(claim.vehicle_id)!;
              if (claim.role === 'driver') v.driver = claim.searcher_name;
              else v.passengers.push(claim.searcher_name);
            }
            for (const [, v] of byVehicle) {
              if (v.driver) {
                const driverCheckin = checkins.find(c => c.searcher_name === v.driver);
                if (driverCheckin?.inspection_submitted) v.inspected = true;
              }
            }
            const entries = [...byVehicle.values()];
            if (entries.length === 0) return <p className="text-xs text-gray-400">No vehicles claimed yet.</p>;
            return (
              <div className="space-y-2">
                {entries.map((v, i) => (
                  <div key={i} className={`rounded-lg border p-2 text-xs ${v.inspected ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                    <div className="font-semibold text-gray-800 truncate">{v.name}</div>
                    <div className="text-gray-500 mt-0.5">
                      {v.driver ? `Driver: ${v.driver}` : <span className="text-yellow-600">No driver yet</span>}
                    </div>
                    {v.passengers.length > 0 && (
                      <div className="text-gray-400 truncate">Passengers: {v.passengers.join(', ')}</div>
                    )}
                    <div className={`mt-0.5 font-semibold ${v.inspected ? 'text-green-600' : 'text-gray-400'}`}>
                      {v.inspected ? '✓ Inspection complete' : '— Inspection pending'}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Op Notes */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Op Notes</div>
          <textarea
            value={planningNotes}
            onChange={e => savePlanning(e.target.value)}
            rows={6}
            placeholder="Sectors, priorities, next tasks…"
            className="w-full text-xs border border-gray-200 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
    </div>
  );
}

function MemberRow({ c, onHeard, isBase, yellowMins = 45, redMins = 60 }: {
  c: CheckIn; onHeard: () => void; isBase?: boolean; yellowMins?: number; redMins?: number;
}) {
  const ddt = new Date(c.drop_dead_time);
  const minsLeft = Math.floor((ddt.getTime() - Date.now()) / 60000);
  const ddtOverdue = minsLeft < 0;
  const ddtUrgent  = !ddtOverdue && minsLeft < 15;
  const rs = radioStatus(c.last_heard_at, yellowMins, redMins);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b text-xs hover:bg-gray-50 group">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBase ? 'bg-gray-300' : rs.color}`}
        title={c.last_heard_at ? `Last heard ${rs.mins}m ago` : 'Not yet confirmed'} />
      <span className="flex-1 font-medium text-gray-800 truncate">{c.searcher_name}</span>
      {rs.mins < 999 && !isBase && (
        <span className={`font-mono shrink-0 text-xs mr-0.5 ${rs.color === 'bg-red-500' ? 'text-red-500' : rs.color === 'bg-yellow-400' ? 'text-yellow-600' : 'text-green-600'}`}>
          {rs.mins}m
        </span>
      )}
      <span className={`font-mono shrink-0 ${ddtOverdue ? 'text-red-600 font-bold' : ddtUrgent ? 'text-yellow-600' : 'text-gray-400'}`}>
        {ddtOverdue ? `+${-minsLeft}m` : `${minsLeft}m`}
      </span>
      <button onClick={e => { e.stopPropagation(); onHeard(); }}
        className="shrink-0 text-gray-300 hover:text-green-600 transition-colors opacity-0 group-hover:opacity-100"
        title="Mark heard">✓</button>
    </div>
  );
}

// ── CalTopo Link Bar with hover QR ────────────────────────────────────────────

function CalTopoLinkBar({ mapId }: { mapId: string }) {
  const [qrData, setQrData] = useState('');
  const [showQr, setShowQr] = useState(false);
  const mapUrl = `https://caltopo.com/m/${mapId}`;

  useEffect(() => {
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(mapUrl, { width: 180, margin: 1 }).then(setQrData).catch(() => {});
    });
  }, [mapId]);

  return (
    <div className="relative border-t border-gray-100 px-3 py-2 flex items-center gap-3 bg-gray-50 shrink-0">
      <span className="text-xs text-gray-500">CalTopo:</span>
      <a href={mapUrl} target="_blank" rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline font-mono flex-1 truncate">{mapUrl}</a>
      <div
        className="relative shrink-0"
        onMouseEnter={() => setShowQr(true)}
        onMouseLeave={() => setShowQr(false)}
      >
        <span className="text-xs text-gray-400 cursor-default border border-gray-200 rounded px-1.5 py-0.5 hover:border-blue-400 hover:text-blue-600 transition-colors">QR</span>
        {showQr && qrData && (
          <div className="absolute bottom-8 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2">
            <img src={qrData} alt="CalTopo QR" width={150} height={150} className="rounded" />
            <p className="text-xs text-center text-gray-400 mt-1">Scan to open map</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Teams tab ─────────────────────────────────────────────────────────────────

function TeamsTab({ op }: { op: Operation }) {
  const [tasks, setTasks]         = useState<TaskWithAssignments[]>([]);
  const [personnel, setPersonnel] = useState<{ id: string; name: string; qualifications?: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newNum, setNewNum]       = useState('');
  const [newType, setNewType]     = useState('');
  const [newTeamType, setNewTeamType] = useState('');
  const [saving, setSaving]       = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';

  async function load() {
    setLoading(true);
    const [taskRes, persRes] = await Promise.all([
      fetch(`/api/tasks?operation_id=${op.id}`,       { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/personnel`,                          { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (taskRes.ok) { const d = await taskRes.json(); setTasks(d.tasks ?? []); }
    if (persRes.ok) { const d = await persRes.json(); setPersonnel(d.personnel ?? []); }
    setLoading(false);
  }

  async function patchTask(taskId: string, patch: object) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (res.ok) { const d = await res.json(); setTasks(prev => prev.map(t => t.id === taskId ? d.task : t)); }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this team/task?')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function createTask() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        operation_id: op.id,
        name: newName.trim(),
        task_number: newNum.trim() || null,
        task_type: newType.trim() || null,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const t = d.task;
      // patch search_type + team_type if provided
      if (newType.trim() || newTeamType.trim()) {
        const pr = await fetch(`/api/tasks/${t.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ search_type: newType.trim() || null, team_type: newTeamType.trim() || null }),
        });
        if (pr.ok) { const pd = await pr.json(); setTasks(prev => [...prev, { ...pd.task, assignments: [] }]); }
        else         { setTasks(prev => [...prev, { ...t, assignments: [] }]); }
      } else {
        setTasks(prev => [...prev, { ...t, assignments: [] }]);
      }
    }
    setNewName(''); setNewNum(''); setNewType(''); setNewTeamType(''); setCreating(false); setSaving(false);
  }

  async function assignPerson(taskId: string, personnelId: string, isLeader: boolean) {
    await patchTask(taskId, { assign_add: { personnel_id: personnelId, is_team_leader: isLeader ? 1 : 0 } });
  }

  async function removeAssignment(taskId: string, personnelId: string) {
    await patchTask(taskId, { assign_remove: personnelId });
  }

  useEffect(() => { load(); }, [op.id]);

  const STATUS_OPTIONS = [
    { val: 'assignment_prepared', label: 'Prepared', color: 'bg-yellow-100 text-yellow-700' },
    { val: 'deployed',            label: 'Deployed', color: 'bg-green-100 text-green-700' },
    { val: 'returned',            label: 'Returned', color: 'bg-gray-100 text-gray-600' },
    { val: 'completed',           label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  ];

  if (loading) return <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Task list */}
      {tasks.length === 0 && !creating && (
        <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
          <p className="mb-3 text-sm">No teams / tasks yet.</p>
        </div>
      )}

      {tasks.map(task => {
        const statusOpt = STATUS_OPTIONS.find(s => s.val === task.status) ?? STATUS_OPTIONS[0];
        const assignedIds = new Set(task.assignments.map(a => a.personnel_id));
        const unassigned = personnel.filter(p => !assignedIds.has(p.id));

        return (
          <div key={task.id} className="bg-white rounded-xl shadow overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              {task.task_number && (
                <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{task.task_number}</span>
              )}
              <span className="font-semibold text-gray-800 flex-1">{task.name}</span>
              {task.task_type && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{task.task_type}</span>}

              {/* Status control */}
              <select
                value={task.status}
                onChange={e => patchTask(task.id, { status: e.target.value })}
                className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer ${statusOpt.color}`}
              >
                {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
              </select>

              <button onClick={() => deleteTask(task.id)} className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
            </div>

            {/* Team detail fields */}
            <div className="px-4 pt-3 grid grid-cols-2 gap-2 border-b pb-3">
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Search Type</label>
                <input defaultValue={task.search_type ?? ''} onBlur={e => patchTask(task.id, { search_type: e.target.value || null })}
                  placeholder="Ground / K9 / Aerial…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Team Type</label>
                <input defaultValue={task.team_type ?? ''} onBlur={e => patchTask(task.id, { team_type: e.target.value || null })}
                  placeholder="Hasty / Grid / Track…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-0.5">Current Assignment</label>
                <input defaultValue={task.current_assignment ?? ''} onBlur={e => patchTask(task.id, { current_assignment: e.target.value || null })}
                  placeholder="e.g. Search grid A3"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-0.5">Planned Assignments (comma-separated)</label>
                <input
                  defaultValue={task.planned_tasks ?? ''}
                  onBlur={e => patchTask(task.id, { planned_tasks: e.target.value || null })}
                  placeholder="A4, B2, B3"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>

            {/* Assignments */}
            <div className="px-4 py-3">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Members ({task.assignments.length})</div>
              <div className="space-y-1 mb-3">
                {task.assignments.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No members assigned.</p>
                )}
                {task.assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    {a.is_team_leader ? <span className="text-xs text-yellow-600 font-bold">★</span> : <span className="w-3" />}
                    <span className="flex-1 text-gray-800">{a.name}</span>
                    <button
                      onClick={() => patchTask(task.id, { assign_add: { personnel_id: a.personnel_id, is_team_leader: a.is_team_leader ? 0 : 1 } })}
                      className="text-xs text-gray-400 hover:text-yellow-600" title="Toggle team leader">
                      {a.is_team_leader ? 'Demote' : 'TL'}
                    </button>
                    <button onClick={() => removeAssignment(task.id, a.personnel_id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
              </div>

              {/* Assign dropdown */}
              {assignTarget === task.id ? (
                <div className="flex gap-2 items-center">
                  <select
                    className="flex-1 text-xs border border-gray-300 rounded p-1.5"
                    defaultValue=""
                    onChange={e => { if (e.target.value) assignPerson(task.id, e.target.value, false); setAssignTarget(null); }}
                  >
                    <option value="" disabled>Select person…</option>
                    {unassigned.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button onClick={() => setAssignTarget(null)} className="text-xs text-gray-400">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setAssignTarget(task.id)}
                  disabled={unassigned.length === 0}
                  className="text-xs text-blue-600 hover:underline disabled:text-gray-300">
                  + Assign member
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Create task form */}
      {creating ? (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-blue-300 space-y-3">
          <div className="text-sm font-semibold text-gray-800">New Team / Task</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Team name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Alpha, Bravo, K9-1…"
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Task #</label>
              <input value={newNum} onChange={e => setNewNum(e.target.value)} placeholder="T-1"
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search type</label>
              <input value={newType} onChange={e => setNewType(e.target.value)} placeholder="Ground / K9 / Aerial / Marine"
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Team type</label>
              <input value={newTeamType} onChange={e => setNewTeamType(e.target.value)} placeholder="Hasty / Grid / Track / Containment"
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={createTask} disabled={saving || !newName.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
          + New Team / Task
        </button>
      )}
    </div>
  );
}

// ── Preset form (shared by create and edit) ───────────────────────────────────

function PresetForm({
  title, name, onName, desc, onDesc, items, onItems,
  eqIds, onToggleEq, equipment, loadingEq, d4hConfigured,
  onSave, onCancel, saveDisabled,
}: {
  title: string;
  name: string; onName: (v: string) => void;
  desc: string; onDesc: (v: string) => void;
  items: string; onItems: (v: string) => void;
  eqIds: Set<number>; onToggleEq: (id: number) => void;
  equipment: D4HEquipmentItem[]; loadingEq: boolean;
  d4hConfigured: boolean;
  onSave: () => void; onCancel: () => void;
  saveDisabled: boolean;
}) {
  const [showEqPicker, setShowEqPicker] = useState(eqIds.size > 0);

  return (
    <div className="border-2 border-blue-300 rounded-xl p-4 space-y-3 mt-2">
      <div className="text-sm font-semibold text-gray-800">{title}</div>

      <input value={name} onChange={e => onName(e.target.value)}
        placeholder="Preset name (e.g. Hasty Team Pack)"
        className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <input value={desc} onChange={e => onDesc(e.target.value)}
        placeholder="Short description (optional)"
        className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Display items (one per line)</label>
        <textarea value={items} onChange={e => onItems(e.target.value)}
          rows={3}
          placeholder={"Rope bag\nRadio × 2\nFirst aid kit"}
          className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
      </div>

      {/* D4H asset linker */}
      <div>
        <button onClick={() => setShowEqPicker(prev => !prev)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
          <span>{showEqPicker ? '▲' : '▼'}</span>
          Link D4H assets ({eqIds.size} linked)
        </button>

        {showEqPicker && (
          <div className="mt-2">
            {!d4hConfigured && (
              <p className="text-xs text-gray-500">D4H token required — <a href="/settings" className="text-blue-600 hover:underline">configure in Settings</a>.</p>
            )}
            {d4hConfigured && loadingEq && (
              <div className="text-xs text-gray-400 py-2">Loading D4H equipment…</div>
            )}
            {d4hConfigured && !loadingEq && equipment.length === 0 && (
              <div className="text-xs text-gray-400 py-2">No D4H equipment loaded.</div>
            )}
            {d4hConfigured && equipment.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {equipment.map((item, i) => (
                  <label key={item.id}
                    className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-blue-50 transition-colors text-sm ${i > 0 ? 'border-t border-gray-100' : ''} ${eqIds.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                    <input type="checkbox" checked={eqIds.has(item.id)} onChange={() => onToggleEq(item.id)}
                      className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
                    <span className="truncate text-gray-800">{item.title}</span>
                    {item.ref && <span className="text-gray-400 text-xs shrink-0">{item.ref}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={onSave} disabled={saveDisabled}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save</button>
      </div>
    </div>
  );
}

// ── Check-In tab ──────────────────────────────────────────────────────────────

interface RosterPerson {
  id: string;
  name: string;
  qualifications?: string;
  phone?: string;
  contact?: string;
  checkin_id?: string;
}

function CheckInTab({ op }: { op: Operation }) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';
  const authHdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const checkInUrl = typeof window !== 'undefined' ? `${window.location.origin}/checkin/${op.id}` : `/checkin/${op.id}`;

  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [roster, setRoster]   = useState<RosterPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData]   = useState('');
  const [copied, setCopied]   = useState(false);

  // manual form
  const [name, setName]           = useState('');
  const [fitForField, setFitForField] = useState(true);
  const defaultDDT = () => {
    const d = new Date(Date.now() + 6 * 3600_000);
    return d.toTimeString().slice(0, 5); // HH:MM
  };
  const [availTime, setAvailTime] = useState(defaultDDT);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [lastCheckedIn, setLastCheckedIn] = useState('');

  async function load() {
    setLoading(true);
    const [ciRes, rostRes] = await Promise.all([
      fetch(`/api/checkin/list?operationId=${op.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/personnel?operation_id=${op.id}`,   { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (ciRes.ok)   { const d = await ciRes.json();   setCheckins(d.checkins ?? []); }
    if (rostRes.ok) { const d = await rostRes.json();  setRoster(d.personnel ?? []); }
    setLoading(false);
  }

  const d4hNumber = op.d4h_incident_id ?? op.d4h_exercise_id ?? '';
  useEffect(() => {
    if (!d4hNumber) return;
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(d4hNumber, { width: 220, margin: 1 }).then(setQrData).catch(() => {});
    });
  }, [d4hNumber]);

  useEffect(() => { load(); }, [op.id]);

  function buildDropDeadTime(timeStr: string): string {
    const [h, m] = timeStr.split(':').map(Number);
    const now = new Date();
    const ddt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    // if the time has already passed today, assume tomorrow
    if (ddt.getTime() < Date.now()) ddt.setDate(ddt.getDate() + 1);
    return ddt.toISOString();
  }

  async function checkIn(searcherName: string, personnelId?: string) {
    if (!searcherName.trim()) return;
    setSaving(true); setSaveErr('');
    try {
      const res = await fetch('/api/checkin/attendance', {
        method: 'POST',
        headers: authHdr,
        body: JSON.stringify({
          operationId: op.id,
          personnelId: personnelId ?? null,
          searcherName: searcherName.trim(),
          fitForField,
          dropDeadTime: buildDropDeadTime(availTime),
          qualsConfirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Check-in failed');
      setLastCheckedIn(searcherName.trim());
      setName(''); setAvailTime(defaultDDT()); setFitForField(true);
      load();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setSaving(false);
    }
  }

  async function heardMember(checkinId: string) {
    const now = new Date().toISOString();
    await fetch(`/api/checkin/${checkinId}`, {
      method: 'PATCH',
      headers: authHdr,
      body: JSON.stringify({ last_heard_at: now }),
    });
    setCheckins(prev => prev.map(c => c.id === checkinId ? { ...c, last_heard_at: now } : c));
  }

  const notCheckedIn = roster.filter(p => !p.checkin_id && !checkins.some(c => c.searcher_name.toLowerCase() === p.name.toLowerCase()));

  if (loading) return <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">Loading…</div>;

  return (
    <div className="space-y-4">

    {/* ── Check-in URL + D4H QR code ── */}
    <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-700 mb-1">Searcher Check-In Link</div>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-blue-700 font-mono break-all">{checkInUrl}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(checkInUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
              className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500">Sent in the Twilio callout SMS. Searchers open this on their phone — no login required.</p>
          {(op.d4h_incident_id ?? op.d4h_exercise_id) && (
            <div className="mt-2 text-xs text-gray-500">
              D4H {op.d4h_activity_type === 'exercise' ? 'Exercise' : 'Incident'} #<span className="font-bold text-gray-700">{op.d4h_incident_id ?? op.d4h_exercise_id}</span>
              <span className="text-gray-400 ml-1">— QR encodes this number →</span>
            </div>
          )}
        </div>
        {qrData && (
          <div className="shrink-0 text-center">
            <img src={qrData} alt="D4H reference QR code" width={110} height={110} className="rounded border border-gray-200" />
            <div className="text-xs text-gray-400 mt-1">D4H #{op.d4h_incident_id ?? op.d4h_exercise_id}</div>
          </div>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left: checked-in list */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-bold text-gray-700">On Scene ({checkins.length})</span>
          <button onClick={load} className="text-xs text-blue-500 hover:underline">↺ Refresh</button>
        </div>
        {checkins.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No searchers checked in yet.</div>
        ) : (
          <div className="divide-y text-sm">
            {checkins.map(c => {
              const rs = radioStatus(c.last_heard_at);
              const ddt = new Date(c.drop_dead_time);
              const minsLeft = Math.floor((ddt.getTime() - Date.now()) / 60000);
              const ddtOver = minsLeft < 0;
              return (
                <div key={c.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.fit_for_field ? rs.color : 'bg-gray-300'}`}
                    title={c.last_heard_at ? `Last heard ${rs.mins}m ago` : 'Not yet confirmed'} />
                  <span className="flex-1 font-medium text-gray-800">{c.searcher_name}</span>
                  {!c.fit_for_field && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Base</span>}
                  <span className={`text-xs font-mono ${ddtOver ? 'text-red-600 font-bold' : minsLeft < 15 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {ddtOver ? `+${-minsLeft}m` : `${minsLeft}m`}
                  </span>
                  <button onClick={() => heardMember(c.id)}
                    className="text-xs text-gray-300 hover:text-green-600 transition-colors px-1"
                    title="Mark heard">✓</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: check-in form + roster */}
      <div className="space-y-4">
        {/* Manual check-in form */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Check In Searcher</h3>
          {lastCheckedIn && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ {lastCheckedIn} checked in
            </div>
          )}
          {saveErr && <p className="mb-3 text-sm text-red-600">{saveErr}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                list="roster-names"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') checkIn(name); }}
                placeholder="Full name…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="roster-names">
                {notCheckedIn.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Available until</label>
                <input
                  type="time"
                  value={availTime}
                  onChange={e => setAvailTime(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={fitForField} onChange={e => setFitForField(e.target.checked)}
                    className="w-4 h-4 accent-green-600" />
                  Fit for field
                </label>
              </div>
            </div>
            <button
              onClick={() => checkIn(name)}
              disabled={saving || !name.trim()}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Checking in…' : 'Check In →'}
            </button>
          </div>
        </div>

        {/* Roster — not checked in */}
        {notCheckedIn.length > 0 && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <span className="text-sm font-bold text-gray-700">Roster — Not On Scene ({notCheckedIn.length})</span>
            </div>
            <div className="divide-y text-sm">
              {notCheckedIn.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
                  <span className="flex-1 text-gray-800">{p.name}</span>
                  {p.qualifications && (
                    <span className="text-xs text-gray-400 truncate max-w-24">
                      {p.qualifications.split(/[,;]+/).slice(0, 2).join(', ')}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setName(p.name);
                      checkIn(p.name, p.id);
                    }}
                    className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 shrink-0">
                    Check In →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ── CalTopo Browse tab ────────────────────────────────────────────────────────

function CalTopoBrowseTab({ op }: { op: Operation }) {
  const { settings } = useSettings();
  const [folders, setFolders] = useState<{ id: string; title: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderErr, setFolderErr] = useState('');
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const mapUrl  = op.caltopo_map_id ? `https://caltopo.com/m/${op.caltopo_map_id}` : null;
  const folderUrl = settings.folderId
    ? `https://caltopo.com/o#${settings.accountId ?? ''}/${settings.folderId}`
    : null;

  async function discoverFolders() {
    if (!settings.credentialId || !settings.secret || !settings.accountId) return;
    setLoadingFolders(true); setFolderErr('');
    try {
      const res = await fetch('/api/caltopo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discoverFolders',
          credentialId: settings.credentialId,
          secret: settings.secret,
          accountId: settings.accountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load folders');
      setFolders(data.folders ?? []);
    } catch (e: unknown) {
      setFolderErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoadingFolders(false);
    }
  }

  useEffect(() => { discoverFolders(); }, []);

  return (
    <div className="space-y-4">
      {/* Quick links */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-center">
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Open Operation Map ↗
          </a>
        )}
        {folderUrl && (
          <a href={folderUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
            Browse CalTopo Folder ↗
          </a>
        )}
        <a href="https://caltopo.com/o" target="_blank" rel="noopener noreferrer"
          className="text-sm text-gray-500 hover:underline">
          Open CalTopo ↗
        </a>
        {!mapUrl && (
          <p className="text-sm text-gray-500">No map linked — run the One-Click Rollout first.</p>
        )}
      </div>

      {/* Embedded map iframe */}
      {mapUrl && !iframeBlocked && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              CalTopo — {op.caltopo_map_id}
            </span>
            <button onClick={() => setIframeBlocked(true)} className="text-xs text-gray-400 hover:underline">
              If map doesn't load, dismiss
            </button>
          </div>
          <iframe
            src={mapUrl}
            title="CalTopo map"
            style={{ width: '100%', height: 520, border: 'none', display: 'block' }}
            onError={() => setIframeBlocked(true)}
          />
        </div>
      )}
      {mapUrl && iframeBlocked && (
        <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
          <p className="mb-3 text-sm">CalTopo doesn't allow embedding — open it directly.</p>
          <a href={mapUrl} target="_blank" rel="noopener noreferrer"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Open Map in CalTopo ↗
          </a>
        </div>
      )}

      {/* Discovered folders */}
      {(folders.length > 0 || loadingFolders || folderErr) && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">Your CalTopo Folders</h3>
            <button onClick={discoverFolders} disabled={loadingFolders} className="text-xs text-blue-500 hover:underline">
              {loadingFolders ? '…' : '↺ Refresh'}
            </button>
          </div>
          {folderErr && <p className="text-sm text-red-500 mb-2">{folderErr}</p>}
          {folders.length === 0 && !loadingFolders && !folderErr && (
            <p className="text-sm text-gray-400">No folders found in your CalTopo account.</p>
          )}
          <div className="space-y-2">
            {folders.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
                <span className="text-sm text-gray-800 font-medium">{f.title}</span>
                <span className="text-xs text-gray-400 font-mono">{f.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operation Edit tab ────────────────────────────────────────────────────────

function OperationEditTab({ op, onUpdated }: { op: Operation; onUpdated: (op: Operation) => void }) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';

  const [form, setForm] = useState<Record<string, string>>({
    name:                    op.name ?? '',
    lost_person_name:        op.lost_person_name ?? '',
    lost_person_age:         op.lost_person_age != null ? String(op.lost_person_age) : '',
    subject_sex:             op.subject_sex ?? '',
    tasking_agency:          op.tasking_agency ?? '',
    oic_name:                op.oic_name ?? '',
    oic_phone:               op.oic_phone ?? '',
    subject_clothing:        op.subject_clothing ?? '',
    subject_gear:            op.subject_gear ?? '',
    lost_person_description: op.lost_person_description ?? '',
    pls_location:            op.pls_location ?? '',
    last_seen_location:      op.last_seen_location ?? '',
    subject_circumstance:    op.subject_circumstance ?? '',
    subject_condition:       op.subject_condition ?? '',
    safety_concerns:         op.safety_concerns ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set(field: string, val: string) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (payload.lost_person_age) payload.lost_person_age = Number(payload.lost_person_age);
      else delete payload.lost_person_age;
      const res = await fetch(`/api/operations/${op.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onUpdated(data.operation);
      setMsg({ ok: true, text: 'Saved.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  const inp = (field: string, label: string, type = 'text', full = false) => (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[field] ?? ''}
        onChange={e => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  const area = (field: string, label: string) => (
    <div className="col-span-2">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <textarea
        rows={3}
        value={form[field] ?? ''}
        onChange={e => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-gray-800">Edit Operation Details</h3>
        <div className="flex items-center gap-4">
          {msg && (
            <span className={`text-sm font-medium ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* 3-column desktop layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Column 1: Subject */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide border-b pb-1">Subject</div>
          {inp('lost_person_name', 'Name')}
          {inp('lost_person_age', 'Age', 'number')}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sex</label>
            <select
              value={form.subject_sex ?? ''}
              onChange={e => set('subject_sex', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          {inp('subject_clothing', 'Clothing')}
          {inp('subject_gear', 'Gear / Equipment')}
          {inp('lost_person_description', 'Physical Description')}
        </div>

        {/* Column 2: Tasking & Location */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide border-b pb-1">Tasking</div>
          {inp('name', 'Operation Name')}
          {inp('tasking_agency', 'Agency')}
          {inp('oic_name', 'OIC Name')}
          {inp('oic_phone', 'OIC Phone', 'tel')}
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide border-b pb-1 mt-4">Location</div>
          {inp('pls_location', 'PLS Description')}
          {inp('last_seen_location', 'LKP Description')}
        </div>

        {/* Column 3: Condition & Safety */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide border-b pb-1">Condition &amp; Safety</div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Circumstances</label>
            <textarea rows={4} value={form.subject_circumstance ?? ''} onChange={e => set('subject_circumstance', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Medical Condition</label>
            <textarea rows={3} value={form.subject_condition ?? ''} onChange={e => set('subject_condition', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Safety Concerns</label>
            <textarea rows={3} value={form.safety_concerns ?? ''} onChange={e => set('safety_concerns', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Communications tab ────────────────────────────────────────────────────────

const WB_NOTES_KEY = 'sarmanager_wb_notes';

interface WbNote {
  id: string;
  text: string;
  postedAt: string;
  postedToD4H: boolean;
}

function loadWbNotes(opId: string): WbNote[] {
  try { return JSON.parse(localStorage.getItem(`${WB_NOTES_KEY}_${opId}`) ?? '[]'); }
  catch { return []; }
}
function saveWbNotes(opId: string, notes: WbNote[]) {
  localStorage.setItem(`${WB_NOTES_KEY}_${opId}`, JSON.stringify(notes));
}

function CommunicationsTab({ op, callD4H, d4hConfigured, settings }: {
  op: Operation;
  callD4H: D4HCallFn;
  d4hConfigured: boolean;
  settings: ReturnType<typeof useSettings>['settings'];
}) {
  // ── Whiteboard ──
  const [notes, setNotes] = useState<WbNote[]>(() => loadWbNotes(op.id));
  const [newNote, setNewNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState('');

  async function addNote() {
    if (!newNote.trim()) return;
    setPosting(true); setPostErr('');
    const note: WbNote = {
      id: crypto.randomUUID(),
      text: newNote.trim(),
      postedAt: new Date().toISOString(),
      postedToD4H: false,
    };
    try {
      if (d4hConfigured && (op.d4h_incident_id || op.d4h_exercise_id)) {
        const incidentId = op.d4h_incident_id;
        const exerciseId = op.d4h_exercise_id;
        await callD4H('postUpdate', {
          ...(incidentId ? { incidentId } : {}),
          ...(exerciseId ? { exerciseId } : {}),
          message: note.text,
        });
        note.postedToD4H = true;
      }
    } catch (e: unknown) {
      setPostErr(e instanceof Error ? e.message : 'Failed to post to D4H');
    }
    const next = [note, ...notes];
    saveWbNotes(op.id, next);
    setNotes(next);
    setNewNote('');
    setPosting(false);
  }

  function deleteNote(id: string) {
    const next = notes.filter(n => n.id !== id);
    saveWbNotes(op.id, next);
    setNotes(next);
  }

  // ── Second Callout with member filter ──
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [roster, setRoster]     = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [scope, setScope] = useState<'all' | 'onscene' | 'notscene'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [calloutMsg, setCalloutMsg] = useState(() => buildCalloutSMS(op));
  const [channel, setChannel] = useState<'sms' | 'call' | 'both'>('sms');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [sendErr, setSendErr] = useState('');
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';

  async function loadPeople() {
    setLoadingPeople(true);
    const [ciRes, rRes] = await Promise.all([
      fetch(`/api/checkin/list?operationId=${op.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/personnel', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (ciRes.ok) { const d = await ciRes.json(); setCheckins(d.checkins ?? []); }
    if (rRes.ok)  { const d = await rRes.json();  setRoster(d.personnel ?? []); }
    setLoadingPeople(false);
  }

  useEffect(() => { loadPeople(); }, [op.id]);

  const onSceneNames = new Set(checkins.map(c => c.searcher_name.toLowerCase()));

  const filteredRoster = roster.filter(p => {
    if (scope === 'onscene')  return onSceneNames.has(p.name.toLowerCase());
    if (scope === 'notscene') return !onSceneNames.has(p.name.toLowerCase());
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAll() { setSelectedIds(new Set(filteredRoster.map(p => p.id))); }
  function clearAll()  { setSelectedIds(new Set()); }

  async function sendCallout() {
    if (!settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioFromNumber) {
      setSendErr('Twilio not configured — add credentials in Settings.');
      return;
    }
    setSending(true); setSendErr(''); setSent('');
    try {
      const checkInUrl = typeof window !== 'undefined' ? `${window.location.origin}/checkin/${op.id}` : `/checkin/${op.id}`;
      const agency = op.tasking_agency ?? 'SAR';
      const age = op.lost_person_age ? `${op.lost_person_age}yo` : '';
      const sex = op.subject_sex ? op.subject_sex.toLowerCase() : '';
      const profileLabel = ISRID[op.subject_category ?? '']?.label ?? 'person';
      const subject = [age, sex, profileLabel].filter(Boolean).join(' ');
      const callMsg = `${agency} SAR callout. Locate missing ${subject}. Please respond immediately to your search manager.`;
      const smsMsg = `${calloutMsg.trim()} ${checkInUrl}`.slice(0, 160);
      const twilioBase = { accountSid: settings.twilioAccountSid, authToken: settings.twilioAuthToken, fromNumber: settings.twilioFromNumber };
      const toNums = selectedIds.size > 0
        ? roster.filter(p => selectedIds.has(p.id) && p.phone).map(p => p.phone!)
        : undefined; // undefined → API sends to full active roster

      const sends: Promise<Response>[] = [];
      if (channel === 'sms' || channel === 'both') {
        sends.push(fetch('/api/twilio/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sms', ...twilioBase, message: smsMsg, ...(toNums ? { to: toNums } : {}) }) }));
      }
      if (channel === 'call' || channel === 'both') {
        sends.push(fetch('/api/twilio/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'call', ...twilioBase, message: callMsg, ...(toNums ? { to: toNums } : {}) }) }));
      }
      const results = await Promise.allSettled(sends);
      const anyOk = results.some(r => r.status === 'fulfilled');
      if (!anyOk) throw new Error('All sends failed');
      setSent(new Date().toLocaleTimeString('en-CA'));
    } catch (e: unknown) {
      setSendErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* ── D4H Whiteboard Notes ── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-bold text-gray-800 mb-1">D4H Whiteboard / Log</h3>
        <p className="text-xs text-gray-500 mb-3">Notes are posted to the D4H incident log and stored locally. Deleting removes them locally only.</p>

        <div className="flex gap-2 mb-3">
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            rows={2}
            placeholder="Enter note to add to D4H whiteboard…"
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={addNote} disabled={posting || !newNote.trim()}
            className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {posting ? '…' : 'Post'}
          </button>
        </div>
        {postErr && <p className="text-xs text-red-600 mb-2">{postErr}</p>}

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">No notes yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notes.map(n => (
              <div key={n.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.text}</p>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    {new Date(n.postedAt).toLocaleString('en-CA')}
                    {n.postedToD4H
                      ? <span className="text-blue-600">✓ D4H</span>
                      : <span className="text-gray-400">local only</span>}
                  </div>
                </div>
                <button onClick={() => deleteNote(n.id)}
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-sm px-1">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SMS/Call Callout ── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-bold text-gray-800 mb-1">Send Callout</h3>
        <p className="text-xs text-gray-500 mb-4">
          Send via Twilio to roster phones. Review and proof the message before sending — check-in link is automatically appended to SMS.
        </p>

        {/* Scope filter */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'onscene', 'notscene'] as const).map(s => (
            <button key={s} onClick={() => { setScope(s); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scope === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
              {s === 'all' ? 'All Roster' : s === 'onscene' ? 'On Scene' : 'Not On Scene'}
            </button>
          ))}
          <button onClick={loadPeople} disabled={loadingPeople} className="ml-auto text-xs text-gray-400 hover:underline">↺</button>
        </div>

        {/* Member list */}
        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto mb-2">
          {loadingPeople ? (
            <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
          ) : filteredRoster.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No members in this group.</div>
          ) : (
            filteredRoster.map((p, i) => {
              const isOnScene = onSceneNames.has(p.name.toLowerCase());
              return (
                <label key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-blue-50 ${i > 0 ? 'border-t border-gray-100' : ''} ${selectedIds.has(p.id) ? 'bg-blue-50' : 'bg-white'}`}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                    className="w-4 h-4 accent-blue-600 shrink-0" />
                  <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                  {p.phone && <span className="text-xs text-gray-400 font-mono">{p.phone}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isOnScene ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isOnScene ? 'On scene' : 'Not on scene'}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex gap-2 mb-4 text-xs">
          <button onClick={selectAll} className="text-blue-600 hover:underline">Select all ({filteredRoster.length})</button>
          <span className="text-gray-300">·</span>
          <button onClick={clearAll} className="text-gray-500 hover:underline">Clear</button>
          <span className="text-gray-500 ml-auto">{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'All roster (if Twilio configured)'}</span>
        </div>

        {/* Channel selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
          <div className="flex gap-2">
            {([['sms', '💬 SMS'], ['call', '📞 Voice Call'], ['both', '💬+📞 Both']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setChannel(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${channel === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Message compose */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Message body (check-in link appended automatically)</label>
          <textarea
            value={calloutMsg}
            onChange={e => setCalloutMsg(e.target.value.slice(0, 140))}
            rows={3}
            className={`w-full p-2 border rounded-lg text-sm resize-none font-mono focus:outline-none focus:ring-2 ${calloutMsg.length >= 140 ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
          />
          <div className={`text-xs mt-1 text-right ${calloutMsg.length >= 140 ? 'text-red-600' : 'text-gray-400'}`}>{calloutMsg.length}/140</div>
        </div>

        {/* Preview */}
        {(channel === 'sms' || channel === 'both') && (
          <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-500 mb-1">SMS Preview (proof before sending)</div>
            <p className="text-xs font-mono text-gray-800 break-all">
              {calloutMsg.trim()} {typeof window !== 'undefined' ? `${window.location.origin}/checkin/${op.id}` : `/checkin/${op.id}`}
            </p>
          </div>
        )}

        {sendErr && <p className="text-xs text-red-600 mb-2">{sendErr}</p>}
        {sent && <p className="text-xs text-green-600 mb-2">✓ Callout sent at {sent}</p>}

        <button onClick={sendCallout} disabled={sending || !calloutMsg.trim()}
          className="w-full bg-orange-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors">
          {sending ? 'Sending…' : `📣 Send ${channel === 'sms' ? 'SMS' : channel === 'call' ? 'Voice Call' : 'SMS + Voice'} Callout`}
        </button>
      </div>
    </div>
  );
}

// ── Personnel Management tab ──────────────────────────────────────────────────

function PersonnelManagementTab({ op, onUpdated }: { op: Operation; onUpdated: (op: Operation) => void }) {
  const [section, setSection] = useState<'checkin' | 'teams'>('checkin');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['checkin', 'teams'] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${section === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
            {s === 'checkin' ? 'Check-In' : 'Teams'}
          </button>
        ))}
      </div>
      {section === 'checkin' && <CheckInTab op={op} />}
      {section === 'teams'   && <TeamsTab op={op} />}
    </div>
  );
}

// ── IMT Checklists tab ────────────────────────────────────────────────────────

const DEFAULT_IMT_CHECKLISTS = [
  { title: 'Incident Commander', color: '#3b82f6', tasks: [
    'Move to Fire Hall / arrange driver from IMT',
    'Inform SAR AB',
    'Inform Local Liaison Officers',
    'Brief Ops & Planning',
    'Interview family',
    'Create IAP',
  ]},
  { title: 'Operations Chief', color: '#f59e0b', tasks: [
    'Move to Fire Hall',
    'Manage load out',
    'Unforward Ops Cell',
    'Establish comms with SM',
    'Monitor D4H — create teams',
    'Conduct safety brief',
    'Deploy',
  ]},
  { title: 'Planning Chief', color: '#10b981', tasks: [
    'Establish virtual hub',
    'Send D4H callout (Twilio)',
    'Create CalTopo map + ISRID rings',
    'Post to D4H whiteboard',
    'Start log',
    'Move to CP once established',
  ]},
  { title: 'Searchers', color: '#8b5cf6', tasks: [
    'Reply to D4H callout',
    'State destination (Firehall or ICP with ETA)',
    'Attend team briefing',
    'Sign out equipment',
    'Conduct safety brief with team leader',
    'Radio check every 60 minutes',
  ]},
];

const IMT_CHECKLISTS_EDIT_KEY = 'sarmanager_imt_checklists';

function IMTChecklistsTab({ op, settings }: {
  op: Operation;
  settings: ReturnType<typeof useSettings>['settings'];
}) {
  // SM Checklist stored per-operation
  const clKey = `sar_checklist_${op.id}`;
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setChecklist(JSON.parse(localStorage.getItem(clKey) ?? '{}')); } catch { /* */ }
  }, [op.id]);
  function setCheck(key: string, val: boolean) {
    const next = { ...checklist, [key]: val };
    setChecklist(next);
    localStorage.setItem(clKey, JSON.stringify(next));
  }

  // Configurable checklists — use settings if set, else localStorage override, else defaults
  const [editMode, setEditMode] = useState(false);
  const storedChecklists: typeof DEFAULT_IMT_CHECKLISTS = (() => {
    if (settings.imtChecklists) return settings.imtChecklists;
    try {
      const s = localStorage.getItem(IMT_CHECKLISTS_EDIT_KEY);
      return s ? JSON.parse(s) : DEFAULT_IMT_CHECKLISTS;
    } catch { return DEFAULT_IMT_CHECKLISTS; }
  })();
  const [checklists, setChecklists] = useState(storedChecklists);

  // Edit state
  const [editData, setEditData] = useState(() => JSON.parse(JSON.stringify(storedChecklists)));

  function saveEdits() {
    localStorage.setItem(IMT_CHECKLISTS_EDIT_KEY, JSON.stringify(editData));
    setChecklists(editData);
    setEditMode(false);
  }

  function addRole() {
    setEditData((prev: typeof DEFAULT_IMT_CHECKLISTS) => [...prev, { title: 'New Role', color: '#6b7280', tasks: [''] }]);
  }

  function updateRole(idx: number, field: 'title' | 'color', val: string) {
    setEditData((prev: typeof DEFAULT_IMT_CHECKLISTS) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function updateTasks(idx: number, text: string) {
    const tasks = text.split('\n').map((s: string) => s.trim()).filter(Boolean);
    setEditData((prev: typeof DEFAULT_IMT_CHECKLISTS) => prev.map((r, i) => i === idx ? { ...r, tasks } : r));
  }

  function removeRole(idx: number) {
    setEditData((prev: typeof DEFAULT_IMT_CHECKLISTS) => prev.filter((_: unknown, i: number) => i !== idx));
  }

  const smChecked = SM_CHECKLIST.filter(i => checklist[i.key]).length;

  return (
    <div className="space-y-4">
      {/* SM Checklist */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">SM Checklist ({smChecked}/{SM_CHECKLIST.length})</h3>
          <button onClick={() => {
            const allDone = SM_CHECKLIST.every(i => checklist[i.key]);
            const next: Record<string, boolean> = {};
            if (!allDone) SM_CHECKLIST.forEach(i => { next[i.key] = true; });
            setChecklist(next);
            localStorage.setItem(clKey, JSON.stringify(next));
          }} className="text-xs text-gray-400 hover:underline">
            {SM_CHECKLIST.every(i => checklist[i.key]) ? 'Clear all' : 'Check all'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SM_CHECKLIST.map(item => (
            <label key={item.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
              <input type="checkbox" checked={!!checklist[item.key]} onChange={e => setCheck(item.key, e.target.checked)}
                className="w-4 h-4 accent-green-600 shrink-0" />
              <span className={`text-sm ${checklist[item.key] ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Role checklists */}
      {!editMode ? (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setEditData(JSON.parse(JSON.stringify(checklists))); setEditMode(true); }}
              className="text-xs text-blue-600 hover:underline">Edit checklists</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checklists.map((cl, idx) => (
              <RoleTrack key={idx} title={cl.title} color={cl.color} tasks={cl.tasks} opId={op.id} />
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-800">Edit IMT Checklists</h3>
            <div className="flex gap-2">
              <button onClick={() => setEditMode(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              <button onClick={saveEdits} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Save</button>
            </div>
          </div>
          {editData.map((cl: { title: string; color: string; tasks: string[] }, idx: number) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input type="color" value={cl.color}
                  onChange={e => updateRole(idx, 'color', e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer shrink-0" />
                <input value={cl.title} onChange={e => updateRole(idx, 'title', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => removeRole(idx)} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tasks (one per line)</label>
                <textarea
                  value={cl.tasks.join('\n')}
                  onChange={e => updateTasks(idx, e.target.value)}
                  rows={Math.max(3, cl.tasks.length + 1)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
          <button onClick={addRole}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
            + Add Role
          </button>
          <button onClick={() => { setEditData(JSON.parse(JSON.stringify(DEFAULT_IMT_CHECKLISTS))); }}
            className="text-xs text-gray-400 hover:underline">Reset to defaults</button>
        </div>
      )}
    </div>
  );
}

// ── Operation Details tab ─────────────────────────────────────────────────────

function OperationDetailsTab({ op, onUpdated, elapsedLabel, caltopoUrl, ippLat, ippLon, hasCoords }: {
  op: Operation;
  onUpdated: (op: Operation) => void;
  elapsedLabel: string;
  caltopoUrl: string;
  ippLat: number;
  ippLon: number;
  hasCoords: boolean;
}) {
  const [section, setSection] = useState<'lpb' | 'smeac' | 'sarab' | 'news'>('lpb');

  const sections = [
    { id: 'lpb',   label: 'Lost Person Behaviour' },
    { id: 'smeac', label: 'SMEAC Briefing' },
    { id: 'sarab', label: 'SAR AB Response' },
    { id: 'news',  label: 'Local News' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${section === s.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
            {s.label}
          </button>
        ))}
      </div>
      {section === 'lpb'   && <LPBPanel op={op} onUpdated={onUpdated} elapsedLabel={elapsedLabel} />}
      {section === 'smeac' && <SMEACPanel op={op} elapsedLabel={elapsedLabel} caltopoUrl={caltopoUrl} />}
      {section === 'sarab' && <SARABPanel lat={ippLat} lon={ippLon} hasCoords={hasCoords} />}
      {section === 'news'  && <LocalNewsPanel op={op} />}
    </div>
  );
}
