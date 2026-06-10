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

function buildCalloutSMS(op: Operation): string {
  const age = op.lost_person_age ? `${op.lost_person_age} year old` : '';
  const sex = op.subject_sex ? op.subject_sex.toLowerCase() : '';
  const agency = op.tasking_agency ?? 'unknown';
  const profile = ISRID[op.subject_category ?? '']?.label ?? 'person';
  const msg = `Active Callout for ${agency} to locate missing ${[age, sex, profile].filter(Boolean).join(' ')}. Report to SAR Base ASAP text 1 if responding.`;
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
  sarcommand: AutoStatus;
  errors: Record<string, string>;
  d4hIncidentId?: string;
  caltopoMapId?: string;
  caltopoUrl?: string;
  calloutId?: string;
  weatherSummary?: string;
}

const AUTO0: AutoState = { d4hIncident: 'idle', caltopo: 'idle', whiteboard: 'idle', callout: 'idle', sarcommand: 'idle', errors: {} };

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
  const [sarLaunched, setSarLaunched] = useState(false);
  const [activeTab, setActiveTab] = useState<'board' | 'teams' | 'rollout' | 'weather' | 'brief' | 'smeac' | 'sarab' | 'news' | 'd4hupdate' | 'secondcallout' | 'equipment'>('board');

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

      const caltopoUrl = op.caltopo_map_id
        ? `https://caltopo.com/m/${op.caltopo_map_id}`
        : (auto.caltopoUrl ?? '');

      // Create the incident
      const d = new Date();
      const dateStr = d.toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase().replace(/ /g, '-').replace(',', '');
      const tempTitle = `${dateStr} PENDING`;

      const { incidentId } = await callD4H('createIncident', {
        title: tempTitle,
        description: buildD4HDescription(op),
        latitude: ippLat,
        longitude: ippLon,
      });

      // Rename with actual D4H ID (non-fatal — incident is already created)
      const finalTitle = `${dateStr} #${incidentId}`;
      try {
        await callD4H('updateIncident', { incidentId, title: finalTitle });
      } catch {
        // D4H v3 incident update may not be available; title stays as PENDING — not critical
      }

      // Save to operation
      const updated = await apiPatch(op.id, {
        d4h_incident_id: String(incidentId),
        weather_snapshot: weatherSummary,
      });
      if (updated) onUpdated(updated);

      setStatus('d4hIncident', 'done', { d4hIncidentId: String(incidentId), weatherSummary });
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

      // Map title: "Location-Date-D4H{id}" matching Electron format
      const albertaDate = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const ippDesc = (op.ipp_type === 'pls' ? op.pls_location : op.last_seen_location) ?? '';
      const locationSlug = ippDesc.trim().split(/[\s,\/]+/).slice(0, 3).join('-') || null;
      const d4hSuffix = `D4H${d4hId ?? '0000000'}`;
      const mapTitle = locationSlug
        ? `${locationSlug}-${albertaDate}-${d4hSuffix}`
        : `${op.name}-${d4hSuffix}`;

      // Folder IDs from template (for routing features to organized layers)
      // Convention: "00 - Critical Incident Info" for markers, "02 - LPB" for rings
      const ippFolderId  = settings.ippFolderId  || undefined;
      const ringFolderId = settings.ringFolderId || undefined;

      // Create the map
      const { mapId, url } = await callCaltopo('createMap', {
        title: mapTitle,
        folderId: settings.folderId || undefined,
      });

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

      // ISRID probability rings — 50 / 75 / 95% only (matches Electron standard)
      const RING_COLORS_CT: Record<number, string> = { 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
      for (const { pct, km } of profile.distances.filter(d => [50, 75, 95].includes(d.pct))) {
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

      const updated = await apiPatch(op.id, { caltopo_map_id: mapId, caltopo_map_url: url, caltopo_features: caltopoFeatures });
      if (updated) onUpdated(updated);

      setStatus('caltopo', 'done', { caltopoMapId: mapId, caltopoUrl: url });
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
    const RING_COLORS_CT: Record<number, string> = { 50: '#FF3300', 75: '#FF8800', 95: '#FFCC00' };
    for (const { pct, km } of profile.distances.filter((d: { pct: number }) => [50, 75, 95].includes(d.pct))) {
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
      const mapUrl = op.caltopo_map_url ?? auto.caltopoUrl ?? (op.caltopo_map_id ? `https://caltopo.com/m/${op.caltopo_map_id}` : '');
      await callD4H('postWhiteboard', {
        title: `🔴 Active Search — ${op.name}`,
        content: [
          `ACTIVE SEARCH OPERATION`,
          op.tasking_agency ? `Tasking: ${op.tasking_agency}` : '',
          op.oic_name ? `OIC: ${op.oic_name}` : '',
          mapUrl ? `CalTopo: ${mapUrl}` : '',
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
      const msg = buildCalloutSMS(op);
      // Use the in-component auto state for the incident ID — it's set by runD4HIncident
      const incidentId = auto.d4hIncidentId ?? op.d4h_incident_id;
      const { calloutId } = await callD4H('sendCallout', { message: msg, incidentId });
      const updated = await apiPatch(op.id, { d4h_callout_id: String(calloutId) });
      if (updated) onUpdated(updated);
      setStatus('callout', 'done', { calloutId: String(calloutId) });
    } catch (e: unknown) {
      setError('callout', e instanceof Error ? e.message : 'Callout error');
    }
  }

  async function runSARCommand() {
    setStatus('sarcommand', 'running');
    try {
      const res = await fetch('/api/sarcommand', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to launch SAR Command Assist');
      setSarLaunched(true);
      // Stays 'running' (amber) until user clicks Mark Done below
    } catch (e: unknown) {
      setError('sarcommand', e instanceof Error ? e.message : 'Launch error');
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
      auto.sarcommand  !== 'skipped' ? runSARCommand()  : Promise.resolve(),
    ]);
    setFiring(false);
  }

  const autoKeys = ['d4hIncident', 'caltopo', 'whiteboard', 'callout', 'sarcommand'] as const;
  const doneCount = autoKeys.filter(k => auto[k] === 'done' || auto[k] === 'skipped' || (k === 'sarcommand' && sarLaunched)).length;
  function skipStep(key: typeof autoKeys[number]) { setAuto(prev => ({ ...prev, [key]: 'skipped' })); }
  function unskipStep(key: typeof autoKeys[number]) { setAuto(prev => ({ ...prev, [key]: 'idle' })); }
  const caltopoUrl = op.caltopo_map_url ?? auto.caltopoUrl ?? (op.caltopo_map_id ? `https://caltopo.com/m/${op.caltopo_map_id}` : '');
  const { h, label: elapsedLabel } = elapsed(op.started_at);
  const profile = ISRID[op.subject_category ?? ''] ?? ISRID.hiker;
  const ippLat = (op.ipp_type === 'pls' ? op.pls_lat : op.latitude) ?? 0;
  const ippLon = (op.ipp_type === 'pls' ? op.pls_lon : op.longitude) ?? 0;
  const hasCoords = ippLat !== 0 && ippLon !== 0;

  const tabs = [
    { id: 'board',        label: '📋 Board' },
    { id: 'teams',        label: '👥 Teams' },
    { id: 'rollout',      label: 'Rollout' },
    { id: 'weather',      label: 'Weather' },
    { id: 'brief',        label: 'Lost Person Brief' },
    { id: 'smeac',        label: 'SMEAC Briefing' },
    { id: 'sarab',        label: 'SAR AB Response' },
    { id: 'news',         label: 'Local News' },
    { id: 'd4hupdate',    label: 'Push Update D4H' },
    { id: 'secondcallout',label: 'Second Callout' },
    { id: 'equipment',    label: 'Equipment' },
  ] as const;

  return (
    <div>
      {/* ── Decision banner (shown until deploy is confirmed) ── */}
      {decisionBanner === 'decide' && (
        <div className="bg-white rounded-xl shadow border-2 border-blue-400 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800">Decision to Deploy</h2>
            <button onClick={() => setDecisionBanner('hidden')} className="text-xs text-gray-400 hover:text-gray-600">Dismiss ✕</button>
          </div>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            Tasking from <strong>{op.tasking_agency ?? '—'}</strong>{op.oic_name ? ` via ${op.oic_name}` : ''}.{' '}
            Subject: <strong>{op.lost_person_name ?? 'Unknown'}</strong>{op.lost_person_age ? `, ${op.lost_person_age}y` : ''}.
            {op.safety_concerns && <span className="text-red-600"> ⚠️ {op.safety_concerns.slice(0, 80)}</span>}
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDecision('yes')}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">
              ✅ DEPLOY
            </button>
            <button onClick={() => setDecision('no')}
              className="flex-1 border-2 border-yellow-500 text-yellow-600 py-3 rounded-xl font-bold hover:bg-yellow-50 transition-colors">
              ⏸ DISCUSS FIRST
            </button>
          </div>
        </div>
      )}

      {decisionBanner === 'discuss' && (
        <div className="bg-white rounded-xl shadow border-2 border-yellow-400 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-yellow-600">SM Discussion</h2>
            <div className="flex gap-2">
              <button onClick={() => setDecision('yes')}
                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                → Deploy
              </button>
              <button onClick={() => setDecisionBanner('hidden')} className="text-xs text-gray-400 hover:text-gray-600">Dismiss ✕</button>
            </div>
          </div>
          <input value={discussWhy} onChange={e => setDiscussWhy(e.target.value)}
            placeholder="Reason for discussion (resources, weather, jurisdiction…)"
            className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed mb-2">
            {[
              `📋 INCIDENT — ${op.tasking_agency ?? 'Unknown Agency'} — ${new Date().toLocaleString()}`,
              `Subject: ${op.lost_person_name ?? '—'}, ${op.lost_person_age ?? '—'}y, ${op.subject_sex ?? '—'}`,
              `Location: ${op.last_seen_location ?? op.pls_location ?? '—'}`,
              `Circumstance: ${op.subject_circumstance?.slice(0, 200) ?? '—'}`,
              `Safety: ${op.safety_concerns || 'None noted'}`,
              discussWhy ? `Why discussing: ${discussWhy}` : '',
            ].filter(Boolean).join('\n')}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText([
                `📋 INCIDENT — ${op.tasking_agency ?? 'Unknown Agency'} — ${new Date().toLocaleString()}`,
                `Subject: ${op.lost_person_name ?? '—'}, ${op.lost_person_age ?? '—'}y, ${op.subject_sex ?? '—'}`,
                `Location: ${op.last_seen_location ?? op.pls_location ?? '—'}`,
                `Safety: ${op.safety_concerns || 'None noted'}`,
                discussWhy ? `Why discussing: ${discussWhy}` : '',
              ].filter(Boolean).join('\n'));
              setDiscussCopied(true); setTimeout(() => setDiscussCopied(false), 2500);
            }}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
            {discussCopied ? '✓ Copied' : 'Copy Message'}
          </button>
        </div>
      )}

      {/* Operation banner */}
      <div className={`bg-white rounded-xl shadow p-4 mb-4 border-l-4 ${op.deploy_decision === 'yes' ? 'border-green-500' : 'border-blue-400'}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className={`font-bold text-lg ${op.deploy_decision === 'yes' ? 'text-green-700' : 'text-gray-700'}`}>
              {op.deploy_decision === 'yes' ? 'DEPLOYED' : 'ACTIVE'} — {op.name}
            </div>
            {op.deploy_decision === 'yes' && op.deploy_timestamp && (
              <div className="text-sm text-gray-600 mt-0.5">Deployed at {fmt(op.deploy_timestamp)} · Elapsed: <span className={h > 6 ? 'text-red-600 font-bold' : 'font-semibold text-gray-800'}>{elapsedLabel}</span></div>
            )}
            {!op.deploy_decision && (
              <div className="text-sm text-gray-500 mt-0.5">Elapsed: <span className="font-semibold text-gray-800">{elapsedLabel}</span></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 font-medium">{doneCount}/{autoKeys.length} complete</span>
            <button onClick={oneClickRollout} disabled={firing}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {firing ? 'Firing…' : doneCount === autoKeys.length ? '↺ Re-fire' : '🚀 One-Click Rollout'}
            </button>
            <Link href={`/operations/${op.id}/close`}
              className="px-4 py-2 rounded-lg text-sm font-bold border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
              Close Op
            </Link>
          </div>
        </div>
      </div>

      {/* Automation status */}
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {(([
            { key: 'd4hIncident', label: op.d4h_activity_type === 'exercise' ? 'D4H Exercise' : 'D4H Incident', onRun: runD4HIncident,
              extra: (op.d4h_incident_id ?? op.d4h_exercise_id ?? auto.d4hIncidentId) ? `#${op.d4h_incident_id ?? op.d4h_exercise_id ?? auto.d4hIncidentId}` : undefined },
            { key: 'caltopo',    label: 'CalTopo Map',        onRun: runCaltopo,     link: caltopoUrl || undefined },
            { key: 'whiteboard', label: 'D4H Whiteboard',     onRun: runWhiteboard },
            { key: 'callout',    label: 'Callout SMS',        onRun: runCallout,     extra: auto.calloutId ? `ID ${auto.calloutId}` : undefined },
            { key: 'sarcommand', label: 'SAR Command Assist', onRun: runSARCommand },
          ]) as { key: typeof autoKeys[number]; label: string; onRun: () => void; link?: string; extra?: string }[])
            .map(({ key, label, onRun, link, extra }) => (
            <AutoBadge key={key} label={label} status={auto[key] as AutoStatus}
              error={auto.errors[key]} link={link} extra={extra}
              onRun={onRun}
              onSkip={() => skipStep(key)}
              onUnskip={() => unskipStep(key)} />
          ))}
        </div>

        {/* SMS preview */}
        <div className="bg-gray-50 rounded-lg p-3 mt-3">
          <div className="text-xs text-gray-600 font-medium mb-1">Callout SMS preview ({buildCalloutSMS(op).length}/150 chars)</div>
          <div className="text-sm font-mono text-gray-800 leading-relaxed">{buildCalloutSMS(op)}</div>
        </div>

        {/* SAR Command Assist reference panel — shown after launch */}
        {sarLaunched && auto.sarcommand !== 'done' && auto.sarcommand !== 'skipped' && (
          <div className="mt-3 border border-amber-300 bg-amber-50 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="font-semibold text-amber-900 text-sm mb-2">SAR Command Assist launched — enter this manually:</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {[
                    ['Task name', op.name],
                    ['Subject', op.lost_person_name],
                    ['Age / Sex', [op.lost_person_age ? `${op.lost_person_age}y` : null, op.subject_sex].filter(Boolean).join(' / ') || null],
                    ['Clothing', op.subject_clothing],
                    ['Profile', ISRID[op.subject_category ?? '']?.label],
                    ['Agency', op.tasking_agency],
                    ['OIC', op.oic_name],
                    ['PLS', op.pls_location],
                    ['PLS UTM', op.pls_lat ? formatUTM(op.pls_lat, op.pls_lon!) : null],
                    ['LKP', op.last_seen_location],
                    ['LKP UTM', op.latitude ? formatUTM(op.latitude, op.longitude!) : null],
                    ['Circumstances', op.subject_circumstance?.slice(0, 120)],
                    ['Safety', op.safety_concerns],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={String(k)} className="contents">
                      <span className="text-amber-700 font-medium">{k}</span>
                      <span className="text-amber-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setStatus('sarcommand', 'done')}
                className="shrink-0 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                Mark Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-white rounded-xl shadow p-1 mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BOARD tab ── */}
      {activeTab === 'board' && (
        <BoardTab op={op} settings={settings} />
      )}

      {/* ── TEAMS tab ── */}
      {activeTab === 'teams' && (
        <TeamsTab op={op} />
      )}

      {/* ── ROLLOUT tab ── */}
      {activeTab === 'rollout' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoleTrack title="Incident Commander" color="#3b82f6" tasks={[
            'Move to Fire Hall / arrange driver from IMT',
            'Inform SAR AB',
            'Inform Local Liaison Officers',
            'Brief Ops & Planning',
            'Interview family',
            'Create IAP',
          ]} opId={op.id} />
          <RoleTrack title="Operations Chief" color="#f59e0b" tasks={[
            'Move to Fire Hall',
            'Manage load out',
            'Unforward Ops Cell',
            'Establish comms with SM',
            'Monitor D4H — create teams',
            'Conduct safety brief',
            'Deploy',
          ]} opId={op.id} />
          <RoleTrack title="Planning Chief" color="#10b981" tasks={[
            'Establish virtual hub',
            'Send D4H callout (Twilio) ✓ AUTO',
            'Create CalTopo map + ISRID rings ✓ AUTO',
            'Push to SAR Command Assist ✓ AUTO',
            'Post to D4H whiteboard ✓ AUTO',
            'Start log',
            'Move to CP once established',
          ]} opId={op.id} />
          <div className="bg-white rounded-xl shadow p-4 border-t-4" style={{ borderTopColor: '#8b5cf6' }}>
            <div className="font-bold text-base mb-2" style={{ color: '#8b5cf6' }}>Searchers</div>
            <div className="text-sm text-gray-700 mb-3 leading-relaxed">Reply to D4H callout:</div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5 text-gray-800">
              <div>Reply <strong>1</strong> → Attending</div>
              <div>Other reply → Pending</div>
              <div>No reply → Not attending</div>
            </div>
            <div className="text-sm text-gray-700 mt-3 leading-relaxed">
              State destination:<br />
              <strong>Firehall with ETA</strong> or <strong>ICP with ETA</strong>
            </div>
            {op.d4h_callout_id && (
              <div className="text-sm text-green-700 mt-2 font-medium">Callout sent · ID {op.d4h_callout_id}</div>
            )}
          </div>
        </div>
      )}

      {/* ── WEATHER tab ── */}
      {activeTab === 'weather' && (
        <WeatherPanel lat={ippLat} lon={ippLon} hasCoords={hasCoords} />
      )}

      {/* ── LOST PERSON BRIEF tab ── */}
      {activeTab === 'brief' && (
        <LPBPanel op={op} onUpdated={onUpdated} elapsedLabel={elapsedLabel} />
      )}

      {/* ── SMEAC tab ── */}
      {activeTab === 'smeac' && <SMEACPanel op={op} elapsedLabel={elapsedLabel} caltopoUrl={caltopoUrl} />}

      {/* ── SAR AB tab ── */}
      {activeTab === 'sarab' && <SARABPanel lat={ippLat} lon={ippLon} hasCoords={hasCoords} />}

      {/* ── LOCAL NEWS tab ── */}
      {activeTab === 'news' && <LocalNewsPanel op={op} />}

      {/* ── PUSH UPDATE D4H tab ── */}
      {activeTab === 'd4hupdate' && (
        <D4HUpdatePanel op={op} callD4H={callD4H} d4hConfigured={Boolean(d4hToken)} />
      )}

      {/* ── SECOND CALLOUT tab ── */}
      {activeTab === 'secondcallout' && (
        <SecondCalloutPanel op={op} callD4H={callD4H} d4hConfigured={Boolean(d4hToken)} defaultSMS={buildCalloutSMS(op)} />
      )}

      {/* ── EQUIPMENT tab ── */}
      {activeTab === 'equipment' && (
        <OperationEquipmentPanel op={op} callD4H={callD4H} d4hConfigured={Boolean(d4hToken)} />
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

function WeatherPanel({ lat, lon, hasCoords }: { lat: number; lon: number; hasCoords: boolean }) {
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

// ── Second Callout panel ──────────────────────────────────────────────────────

function SecondCalloutPanel({ op, callD4H, d4hConfigured, defaultSMS }: {
  op: Operation; callD4H: D4HCallFn; d4hConfigured: boolean; defaultSMS: string;
}) {
  const [message, setMessage] = useState(defaultSMS);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [responses, setResponses] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  async function sendCallout() {
    if (!message.trim()) return;
    setSending(true); setError('');
    try {
      const trimmed = message.slice(0, 150);
      await callD4H('sendCallout', {
        message: trimmed,
        incidentId: op.d4h_incident_id,
      });
      setSent(new Date().toLocaleTimeString('en-CA'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send callout');
    } finally {
      setSending(false);
    }
  }

  async function loadResponses() {
    if (!op.d4h_callout_id) return;
    setLoadingResponses(true);
    try {
      const data = await callD4H('getCalloutResponses', { calloutId: op.d4h_callout_id });
      const raw = (data.responses as Record<string, unknown>[]) ?? [];
      setResponses(raw.map(r => ({
        id: String(r.id ?? ''),
        name: String((r.member as Record<string, unknown>)?.name ?? r.name ?? 'Unknown'),
        status: String(r.status ?? r.response ?? 'pending'),
      })));
    } catch {
      // ignore
    } finally {
      setLoadingResponses(false);
    }
  }

  useEffect(() => { loadResponses(); }, []);

  if (!d4hConfigured) {
    return (
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-600">
        <p className="mb-2">D4H token not configured.</p>
        <a href="/settings" className="text-sm text-blue-600 hover:underline">Go to Settings →</a>
      </div>
    );
  }

  const charCount = message.length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold text-gray-800 mb-1">Second Callout</h3>
        <p className="text-sm text-gray-500 mb-4">
          Send a follow-up D4H callout (via Twilio) to the team. Max 150 characters.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Callout message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 150))}
            rows={3}
            className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 text-sm resize-none font-mono ${charCount >= 150 ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
          />
          <div className={`text-xs mt-1 text-right font-medium ${charCount >= 150 ? 'text-red-600' : charCount >= 130 ? 'text-yellow-600' : 'text-gray-600'}`}>
            {charCount}/150 chars
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {sent && <p className="text-sm text-green-600 mb-3">✓ Callout sent at {sent}</p>}

        <div className="flex gap-3 mb-4">
          <button
            onClick={sendCallout}
            disabled={sending || !message.trim()}
            className="flex-1 bg-orange-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : '📣 Send Callout via D4H'}
          </button>
          <button
            onClick={() => setMessage(defaultSMS)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="text-xs text-gray-500">
          Alternate templates:
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            `URGENT — All available members report to SAR Base immediately. Active mission in progress.`,
            `Stand down. Subject located. Thank you for your response. All teams return to base.`,
            `Second callout — additional searchers needed. Report to fire hall by ${new Date(Date.now() + 3600000).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}.`,
          ].map(t => (
            <button
              key={t}
              onClick={() => setMessage(t.slice(0, 150))}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:border-orange-400 hover:text-orange-600 transition-colors text-left"
            >
              {t.slice(0, 60)}…
            </button>
          ))}
        </div>
      </div>

      {/* Response tracker */}
      {op.d4h_callout_id && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">Callout Responses</h3>
            <button onClick={loadResponses} disabled={loadingResponses} className="text-sm text-blue-600 hover:underline">
              {loadingResponses ? '…' : 'Refresh'}
            </button>
          </div>

          {responses.length === 0 ? (
            <p className="text-sm text-gray-600">No responses yet — or not available from D4H API.</p>
          ) : (
            <div className="space-y-2">
              {responses.map(r => {
                const s = r.status.toUpperCase();
                const isYes = s === 'ATTENDING' || s === '1' || s === 'YES';
                const isNo = s === 'ABSENT' || s === 'NO' || s === 'UNAVAILABLE';
                return (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <span className="text-sm text-gray-700">{r.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isYes ? 'bg-green-100 text-green-700' : isNo ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {isYes ? '✓ Attending' : isNo ? '✗ Unavailable' : r.status}
                    </span>
                  </div>
                );
              })}
              <div className="text-xs text-gray-600 pt-1">
                {responses.filter(r => ['ATTENDING', '1', 'YES'].includes(r.status.toUpperCase())).length} attending ·{' '}
                {responses.filter(r => ['ABSENT', 'NO', 'UNAVAILABLE'].includes(r.status.toUpperCase())).length} absent ·{' '}
                {responses.filter(r => !['ATTENDING', '1', 'YES', 'ABSENT', 'NO', 'UNAVAILABLE'].includes(r.status.toUpperCase())).length} pending
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

const DEPLOY_PRESETS_KEY = 'sarmanager_deploy_presets';
const OP_EQ_LOG_KEY      = 'sarmanager_op_equipment_logs';

const DEFAULT_PRESETS: DeployPreset[] = [
  {
    id: 'default-hasty',
    name: 'Hasty Team Pack',
    description: 'Standard 4-person hasty search loadout',
    items: ['SAR packs × 4', 'Navigation kit', 'Radio × 2', 'First aid kit', 'Rope bag'],
    equipmentIds: [],
  },
  {
    id: 'default-rope',
    name: 'Technical Rescue Kit',
    description: 'Rope rescue and vertical terrain equipment',
    items: ['Rope bag', 'Harnesses × 4', 'Carabiners', 'Belay devices', 'Helmets × 4'],
    equipmentIds: [],
  },
  {
    id: 'default-medical',
    name: 'Medical Response Pack',
    description: 'Enhanced medical and patient packaging',
    items: ['AED', 'Oxygen kit', 'Patient packaging', 'Stretcher', 'Trauma kit'],
    equipmentIds: [],
  },
];

function loadDeployPresets(): DeployPreset[] {
  try {
    const stored = JSON.parse(localStorage.getItem(DEPLOY_PRESETS_KEY) ?? 'null');
    if (Array.isArray(stored)) return stored;
  } catch { /* empty */ }
  localStorage.setItem(DEPLOY_PRESETS_KEY, JSON.stringify(DEFAULT_PRESETS));
  return DEFAULT_PRESETS;
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

  const deployedPresetIds = new Set(deployments.map(d => d.preset_id));

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
  last_heard_at?: string;
}
interface TaskWithAssignments {
  id: string; name: string; task_number?: string; status: string;
  task_type?: string; description?: string;
  search_type?: string; team_type?: string;
  current_assignment?: string; planned_tasks?: string;
  assignments: { id: string; personnel_id: string; is_team_leader: number; name: string }[];
}

// Radio check-in status (ICS standard: green <45m, yellow 45-60m, red >60m)
function radioStatus(lastHeardAt?: string): { color: string; mins: number } {
  if (!lastHeardAt) return { color: 'bg-gray-300', mins: 999 };
  const mins = Math.max(0, Math.round((Date.now() - new Date(lastHeardAt).getTime()) / 60000));
  if (mins > 60) return { color: 'bg-red-500', mins };
  if (mins > 45) return { color: 'bg-yellow-400', mins };
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

function BoardTab({ op, settings }: { op: Operation; settings: ReturnType<typeof useSettings>['settings'] }) {
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [tasks, setTasks]       = useState<TaskWithAssignments[]>([]);
  const [features, setFeatures] = useState<unknown[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError]     = useState('');
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
    if (ciRes.ok)   { const d = await ciRes.json();   setCheckins(d.checkins ?? []); }
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
      setFeatures(data.features ?? []);
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
    if ((op as any).caltopo_features) {
      try {
        const parsed = JSON.parse((op as any).caltopo_features);
        setFeatures(parsed?.features ?? []);
      } catch { /* fall through to API load */ }
    }
    loadMap();
  }, [op.id, op.caltopo_map_id]);
  useEffect(() => {
    const t = setInterval(() => setCheckins(prev => [...prev]), 60000); // force re-render for timer
    return () => clearInterval(t);
  }, []);

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
                {members.map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} />)}
              </div>
            );
          })}
          {fieldMembers.filter(c => !assignedNames.has(c.searcher_name.toLowerCase())).length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-t">Unassigned</div>
              {fieldMembers.filter(c => !assignedNames.has(c.searcher_name.toLowerCase()))
                .map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} />)}
            </>
          )}
          {baseMembers.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-t">Base ({baseMembers.length})</div>
              {baseMembers.map(c => <MemberRow key={c.id} c={c} onHeard={() => heardMember(c.id)} isBase />)}
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
          {op.caltopo_map_id && loadingMap && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading map features…</div>
          )}
          {op.caltopo_map_id && mapError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
              <p className="text-red-500 text-sm">{mapError}</p>
              <button onClick={loadMap} className="text-xs text-blue-600 hover:underline">Retry</button>
            </div>
          )}
          {op.caltopo_map_id && !loadingMap && !mapError && features.length > 0 && MapComponent && (
            <MapComponent features={features} />
          )}
          {op.caltopo_map_id && !loadingMap && !mapError && features.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-sm">Map loaded but no features found.</p>
              <button onClick={loadMap} className="text-xs text-blue-600 hover:underline">Reload</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right widgets (220px) ── */}
      <div className="shrink-0 space-y-3 overflow-y-auto" style={{ width: 220 }}>
        {/* Team Status */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Team Status</div>
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-400">No teams yet — use Teams tab.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const teamCheckins = checkins.filter(c =>
                  t.assignments.some(a => a.name.toLowerCase() === c.searcher_name.toLowerCase())
                );
                const worstMins = teamCheckins.length
                  ? Math.max(...teamCheckins.map(c => radioStatus(c.last_heard_at).mins))
                  : 999;
                const borderColor = worstMins > 60 ? 'border-red-400' : worstMins > 45 ? 'border-yellow-400' : worstMins < 999 ? 'border-green-400' : 'border-gray-200';
                const textColor   = worstMins > 60 ? 'text-red-600' : worstMins > 45 ? 'text-yellow-600' : 'text-gray-400';
                return (
                  <div key={t.id} className={`border rounded-lg p-2 ${borderColor}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-800 truncate flex-1">{t.name}</span>
                      <span className={`text-xs font-mono ml-1 ${textColor}`}>
                        {worstMins < 999 ? `${worstMins}m` : '—'}
                      </span>
                    </div>
                    {t.current_assignment && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">▶ {t.current_assignment}</div>
                    )}
                    <button onClick={() => heardTeam(t)}
                      className="mt-1 text-xs text-blue-600 hover:underline">✓ Heard team</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SM Checklist */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            SM Checklist ({SM_CHECKLIST.filter(i => checklist[i.key]).length}/{SM_CHECKLIST.length})
          </div>
          <div className="space-y-1.5">
            {SM_CHECKLIST.map(item => (
              <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!checklist[item.key]} onChange={e => setCheck(item.key, e.target.checked)}
                  className="w-3.5 h-3.5 accent-green-600 shrink-0" />
                <span className={`text-xs ${checklist[item.key] ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Planning Notes */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Planning Notes</div>
          <textarea
            value={planningNotes}
            onChange={e => savePlanning(e.target.value)}
            rows={5}
            placeholder="Sectors, priorities, next tasks…"
            className="w-full text-xs border border-gray-200 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Stats</div>
          <div className="space-y-1 text-xs">
            {[
              ['Field', String(fieldMembers.length)],
              ['Base', String(baseMembers.length)],
              ['Deployed', String(tasks.filter(t => t.status === 'deployed').length)],
              ['Returned', String(tasks.filter(t => t.status === 'returned').length)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ c, onHeard, isBase }: { c: CheckIn; onHeard: () => void; isBase?: boolean }) {
  const ddt = new Date(c.drop_dead_time);
  const minsLeft = Math.floor((ddt.getTime() - Date.now()) / 60000);
  const ddtOverdue  = minsLeft < 0;
  const ddtUrgent   = !ddtOverdue && minsLeft < 15;
  const rs = radioStatus(c.last_heard_at);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b text-xs hover:bg-gray-50 group">
      {/* Radio status dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBase ? 'bg-gray-300' : rs.color}`}
        title={c.last_heard_at ? `Last heard ${rs.mins}m ago` : 'Not yet confirmed'} />
      <span className="flex-1 font-medium text-gray-800 truncate">{c.searcher_name}</span>
      {/* Drop-dead countdown */}
      <span className={`font-mono shrink-0 ${ddtOverdue ? 'text-red-600 font-bold' : ddtUrgent ? 'text-yellow-600' : 'text-gray-400'}`}>
        {ddtOverdue ? `+${-minsLeft}m` : `${minsLeft}m`}
      </span>
      {/* Heard button — visible on hover */}
      <button onClick={e => { e.stopPropagation(); onHeard(); }}
        className="shrink-0 text-gray-300 hover:text-green-600 transition-colors opacity-0 group-hover:opacity-100"
        title="Mark heard (radio check-in)">✓</button>
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
