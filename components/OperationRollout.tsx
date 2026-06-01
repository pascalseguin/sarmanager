'use client';

import { useState, useEffect, useCallback } from 'react';
import { Operation, operationsStore } from '@/lib/operations-store';
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
  const decision = op.deploy_decision ?? null;

  async function setDecision(d: 'yes' | 'no') {
    const updated = operationsStore.update(op.id, {
      deploy_decision: d,
      deploy_timestamp: new Date().toISOString(),
    });
    if (updated) onUpdated(updated);
  }

  if (decision === null) return <DecisionScreen op={op} onDecide={setDecision} />;
  if (decision === 'no') return <DiscussScreen op={op} onDeploy={() => setDecision('yes')} />;
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

  const [auto, setAuto] = useState<AutoState>(AUTO0);
  const [firing, setFiring] = useState(false);
  const [sarLaunched, setSarLaunched] = useState(false);
  const [activeTab, setActiveTab] = useState<'rollout' | 'weather' | 'brief' | 'smeac' | 'sarab' | 'news' | 'd4hupdate' | 'secondcallout'>('rollout');

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
      body: JSON.stringify({ action, token: d4hToken, ...extra }),
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

      // Rename with actual D4H ID
      const finalTitle = `${dateStr} #${incidentId}`;
      await callD4H('updateIncident', { incidentId, title: finalTitle });

      // Save to operation
      const updated = operationsStore.update(op.id, {
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
      const mapTitle = op.d4h_incident_id
        ? `${new Date().toLocaleDateString('en-CA', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} #${op.d4h_incident_id}`
        : op.name;

      // Create the map
      const { mapId, url } = await callCaltopo('createMap', {
        title: mapTitle,
        folderId: settings.folderId || undefined,
      });

      // Add IPP marker
      await callCaltopo('addFeature', {
        mapId,
        feature: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [ippLon, ippLat] },
          properties: {
            title: `IPP (${op.ipp_type?.toUpperCase()})`,
            description: op.ipp_type === 'pls' ? (op.pls_location ?? '') : (op.last_seen_location ?? ''),
            'marker-color': '#ef4444',
          },
        },
      });

      // Add PLS marker if different from IPP
      if (op.pls_lat && op.pls_lon && op.ipp_type !== 'pls') {
        await callCaltopo('addFeature', {
          mapId,
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [op.pls_lon, op.pls_lat] },
            properties: { title: 'PLS', description: op.pls_location ?? '', 'marker-color': '#f59e0b' },
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

      // Add ISRID probability rings (25%, 50%, 75%, 95%)
      for (const { pct, km } of profile.distances) {
        const ring = circlePolygon(ippLat, ippLon, km);
        ring.properties = {
          title: `${pct}% — ${km} km (${profile.label})`,
          stroke: RING_COLORS[pct],
          'stroke-width': 2,
          fill: RING_COLORS[pct],
          'fill-opacity': 0.05,
        };
        await callCaltopo('addFeature', { mapId, feature: ring });
      }

      const updated = operationsStore.update(op.id, { caltopo_map_id: mapId, caltopo_map_url: url });
      if (updated) onUpdated(updated);

      setStatus('caltopo', 'done', { caltopoMapId: mapId, caltopoUrl: url });
    } catch (e: unknown) {
      setError('caltopo', e instanceof Error ? e.message : 'CalTopo error');
    }
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
      // Read fresh op from store — runD4HIncident saves d4h_incident_id synchronously
      // to localStorage before this runs, so the stale `op` prop is bypassed.
      const freshOp = operationsStore.get(op.id);
      const incidentId = freshOp?.d4h_incident_id ?? op.d4h_incident_id;
      const { calloutId } = await callD4H('sendCallout', { message: msg, incidentId });
      const updated = operationsStore.update(op.id, { d4h_callout_id: String(calloutId) });
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
    { id: 'rollout', label: 'Rollout' },
    { id: 'weather', label: 'Weather' },
    { id: 'brief', label: 'Lost Person Brief' },
    { id: 'smeac', label: 'SMEAC Briefing' },
    { id: 'sarab', label: 'SAR AB Response' },
    { id: 'news', label: 'Local News' },
    { id: 'd4hupdate', label: 'Push Update D4H' },
    { id: 'secondcallout', label: 'Second Callout' },
  ] as const;

  return (
    <div>
      {/* Operation banner */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 border-l-4 border-green-500">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-green-700 text-lg">DEPLOYED — {op.name}</div>
            {op.deploy_timestamp && (
              <div className="text-sm text-gray-600 mt-0.5">Decision at {fmt(op.deploy_timestamp)} · Elapsed: <span className={h > 6 ? 'text-red-600 font-bold' : 'font-semibold text-gray-800'}>{elapsedLabel}</span></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 font-medium">{doneCount}/{autoKeys.length} complete</span>
            <button onClick={oneClickRollout} disabled={firing}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {firing ? 'Firing…' : doneCount === autoKeys.length ? '↺ Re-fire' : '🚀 One-Click Rollout'}
            </button>
          </div>
        </div>
      </div>

      {/* Automation status */}
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {(([
            { key: 'd4hIncident', label: 'D4H Incident',      onRun: runD4HIncident, extra: auto.d4hIncidentId ? `#${auto.d4hIncidentId}` : undefined },
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
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">{profile.emoji}</span>
            <div>
              <div className="font-bold text-xl">{profile.label}</div>
              <div className="text-sm text-gray-500">{op.subject_category} · ISRID Profile</div>
            </div>
          </div>
          <p className="text-gray-700 mb-6 leading-relaxed text-base">{profile.notes}</p>

          <div className="mb-6">
            <div className="font-semibold text-base text-gray-800 mb-3">Probability Ring Distances</div>
            <div className="space-y-2">
              {profile.distances.map(d => (
                <div key={d.pct} className="flex items-center gap-3">
                  <div className="w-14 text-right font-bold text-sm" style={{ color: RING_COLORS[d.pct] }}>{d.pct}%</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.km / 20) * 100)}%`, background: RING_COLORS[d.pct] }} />
                  </div>
                  <div className="w-20 font-semibold text-sm text-gray-800">{d.km} km</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">Radius from IPP within which that % of subjects have been found (ISRID data).</p>
          </div>

          <div className="border-t pt-4">
            <div className="font-semibold text-base text-gray-800 mb-2">Subject Summary</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
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
                  <span className="text-gray-600 font-medium">{k}</span>
                  <span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
