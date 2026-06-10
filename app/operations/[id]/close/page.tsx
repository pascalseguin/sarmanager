'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface Operation {
  id: string; name: string; status: string; started_at: string; ended_at?: string;
  tasking_agency?: string; oic_name?: string; oic_phone?: string;
  lost_person_name?: string; lost_person_age?: number; subject_sex?: string;
  subject_clothing?: string; subject_gear?: string; subject_condition?: string;
  subject_circumstance?: string; safety_concerns?: string;
  pls_location?: string; pls_lat?: number; pls_lon?: number; pls_time?: string;
  last_seen_location?: string; latitude?: number; longitude?: number;
  ipp_type?: string; terrain_type?: string; subject_category?: string;
  deploy_decision?: string; deploy_timestamp?: string;
  caltopo_map_id?: string; d4h_incident_id?: string;
  active_ipp_utm?: string; lkp_utm?: string; pls_utm?: string;
}

interface Personnel { id: string; name: string; role?: string; status?: string }
interface Task { id: string; name: string; task_number?: string; status: string; debrief_notes?: string; started_at?: string; completed_at?: string; assignments: { name: string; is_team_leader: number }[] }
interface CheckIn { id: string; searcher_name: string; fit_for_field: number; drop_dead_time: string; vehicle_role?: string; vehicle_name?: string; checked_in_at: string; inspection_submitted: number }

function fmt(dt?: string) { return dt ? new Date(dt).toLocaleString('en-CA') : '—'; }
function elapsed(a: string, b?: string) {
  const ms = (b ? new Date(b) : new Date()).getTime() - new Date(a).getTime();
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function ClosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, authFetch } = useAuth();

  const [op, setOp] = useState<Operation | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [fetching, setFetching] = useState(true);

  const [outcome, setOutcome] = useState<'located' | 'suspended' | 'cancelled' | 'other'>('located');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [incidentCommander, setIncidentCommander] = useState('');
  const [planningChief, setPlanningChief] = useState('');
  const [opsChief, setOpsChief] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const [activeDoc, setActiveDoc] = useState<'fn1' | 'ics201' | 'ics204' | 'ics211' | 'turnout' | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      authFetch(`/api/operations/${id}`).then(r => r.json()),
      authFetch(`/api/personnel`).then(r => r.json()),
      authFetch(`/api/tasks?operation_id=${id}`).then(r => r.json()),
      authFetch(`/api/checkin/list?operationId=${id}`).then(r => r.json()),
    ]).then(([opData, persData, taskData, ciData]) => {
      setOp(opData.operation ?? null);
      setPersonnel(persData.personnel ?? []);
      setTasks(taskData.tasks ?? []);
      setCheckins(ciData.checkins ?? []);
    }).catch(() => {}).finally(() => setFetching(false));
  }, [user, id]);

  async function closeOperation() {
    if (!confirm('This will permanently close the operation. Continue?')) return;
    setClosing(true);
    try {
      await authFetch(`/api/operations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      await authFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: id,
          event_type: 'closure',
          title: 'Operation Closed',
          description: [
            `Outcome: ${outcome}`,
            outcomeNote ? `Notes: ${outcomeNote}` : '',
            incidentCommander ? `IC: ${incidentCommander}` : '',
            closingNote ? closingNote : '',
          ].filter(Boolean).join('\n'),
          severity: 'info',
        }),
      });
      setClosed(true);
      setTimeout(() => router.push('/operations'), 1500);
    } catch { setClosing(false); }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2500);
  }

  // ── Document generators ────────────────────────────────────────────────────

  function ics201(): string {
    if (!op) return '';
    const ippDesc = op.ipp_type === 'pls' ? op.pls_location : op.last_seen_location;
    const ippUtm = op.ipp_type === 'pls' ? op.pls_utm : op.lkp_utm;
    return [
      `ICS 201 — INCIDENT BRIEFING`,
      `Incident Name: ${op.name}`,
      `Date/Time: ${fmt(op.started_at)}`,
      `Prepared by: ${incidentCommander || '_______________'}`,
      ``,
      `1. MAP/SKETCH — CalTopo: ${op.caltopo_map_id ? `https://caltopo.com/m/${op.caltopo_map_id}` : 'N/A'}`,
      ``,
      `2. SITUATION SUMMARY`,
      `Tasking Agency: ${op.tasking_agency ?? '—'}   OIC: ${op.oic_name ?? '—'}  ${op.oic_phone ?? ''}`,
      `Subject: ${op.lost_person_name ?? '—'}, ${op.lost_person_age ?? '—'}y, ${op.subject_sex ?? '—'}`,
      `Clothing: ${op.subject_clothing ?? '—'}`,
      `Gear: ${op.subject_gear ?? '—'}`,
      `Medical: ${op.subject_condition ?? '—'}`,
      `Circumstances: ${op.subject_circumstance ?? '—'}`,
      ``,
      `3. INITIAL RESPONSE`,
      `IPP (${op.ipp_type?.toUpperCase() ?? 'LKP'}): ${ippDesc ?? '—'}  UTM: ${ippUtm ?? '—'}`,
      `PLS: ${op.pls_location ?? '—'}  ${op.pls_time ? `at ${fmt(op.pls_time)}` : ''}`,
      `LKP: ${op.last_seen_location ?? '—'}`,
      `Terrain: ${op.terrain_type ?? '—'}  Safety: ${op.safety_concerns ?? 'none noted'}`,
      ``,
      `4. CURRENT ORGANIZATION`,
      `Incident Commander: ${incidentCommander || '_______________'}`,
      `Planning Chief: ${planningChief || '_______________'}`,
      `Operations Chief: ${opsChief || '_______________'}`,
      ``,
      `5. RESOURCES SUMMARY`,
      ...tasks.map(t => `  ${t.task_number ?? t.name}: ${t.assignments.map(a => a.name).join(', ')} [${t.status}]`),
      ``,
      `6. SUMMARY OF CURRENT ACTIONS`,
      closingNote || '_______________________________________________',
    ].join('\n');
  }

  function ics204(): string {
    if (!op || !tasks.length) return 'No tasks recorded for this operation.';
    return [
      `ICS 204 — ASSIGNMENT LIST`,
      `Incident: ${op.name}   Date: ${fmt(op.started_at)}`,
      ``,
      ...tasks.map(t => [
        `Task: ${t.task_number ?? t.name}   Status: ${t.status}`,
        `  Personnel: ${t.assignments.map(a => `${a.name}${a.is_team_leader ? ' (TL)' : ''}`).join(', ') || 'unassigned'}`,
        t.debrief_notes ? `  Debrief: ${t.debrief_notes}` : '',
        t.started_at ? `  Deployed: ${fmt(t.started_at)}   Returned: ${fmt(t.completed_at)}` : '',
      ].filter(Boolean).join('\n')),
    ].join('\n');
  }

  function ics211(): string {
    if (!op) return '';
    const rows = checkins.map(c =>
      `  ${c.searcher_name.padEnd(24)} | ${c.fit_for_field ? 'Field' : 'Base '} | ${fmt(c.drop_dead_time)} | ${(c.vehicle_role ?? '—').padEnd(10)} | ${c.vehicle_name ?? '—'}`
    ).join('\n');
    return [
      `ICS 211 — CHECK-IN LIST`,
      `Incident: ${op.name}`,
      ``,
      `  Name                     | Status | Drop-Dead     | Role       | Vehicle`,
      `  ${'─'.repeat(80)}`,
      rows || '  (no check-ins recorded)',
    ].join('\n');
  }

  function seasarFirstNotice(): string {
    if (!op) return '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA');
    const timeStr = now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
    const ippUtm = op.ipp_type === 'pls' ? (op.pls_utm ?? op.active_ipp_utm) : (op.lkp_utm ?? op.active_ipp_utm);
    const lastSeenPlace = op.ipp_type === 'pls' ? (op.pls_location ?? '') : (op.last_seen_location ?? '');
    const lastSeenDate = op.pls_time ? new Date(op.pls_time).toLocaleDateString('en-CA') : '_______________';
    const lastSeenTime = op.pls_time ? new Date(op.pls_time).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }) : '_______________';

    const header = (title: string) => [
      `════════════════════════════════════════════════════════════════`,
      `  SEASAR ${title}`,
      `════════════════════════════════════════════════════════════════`,
      `  Incident Name: ${op.name.padEnd(28)} Date: ${dateStr}   Time: ${timeStr}`,
      `  D4H#: ${(op.d4h_incident_id ?? '___________').padEnd(20)}`,
      ``,
      `  Completed by: ${(incidentCommander || '_______________').padEnd(24)} Number: _______________`,
      `  Agency: ${(op.tasking_agency ?? '_______________').padEnd(26)} Contact: ${op.oic_name ?? '_______________'}`,
      `  Agency Phone: ${(op.oic_phone ?? '_______________').padEnd(22)} Operational Period: 10 hrs`,
      `  SEASAR IC: ${(incidentCommander || '_______________').padEnd(24)} Planning: ${(planningChief || '_______________').padEnd(18)} Ops: ${opsChief || '_______________'}`,
      ``,
    ].join('\n');

    const page1 = [
      header('First Notice – PERSON  (Page 1)'),
      `  Name of Missing Person: ${op.lost_person_name ?? '_______________________________________________'}`,
      `  Date of Birth:          _______________   Cell #: _______________`,
      ``,
      `  Date Last Seen: ${lastSeenDate.padEnd(20)} Time Last Seen: ${lastSeenTime.padEnd(20)} Place: ${lastSeenPlace || '_______________'}`,
      ``,
      `  Age: ${op.lost_person_age ? String(op.lost_person_age).padEnd(12) : '_______'} Height: _______________   Weight: _______________`,
      ``,
      `  Skin/Hair: ___________________________   Clothing: ${op.subject_clothing ?? '_______________________________________________'}`,
      ``,
      `  Shoes/Gear: ${op.subject_gear ?? '______________________________________________'}`,
      ``,
      `  Circumstances:`,
      `    ${op.subject_circumstance ?? '_______________________________________________________________'}`,
      ``,
      `  Health Concerns:`,
      `    ${op.subject_condition ?? '_______________________________________________________________'}`,
      ``,
      `  Safety Concerns:`,
      `    ${op.safety_concerns ?? '_______________________________________________________________'}`,
      ``,
      `  Relevant History:`,
      `    _______________________________________________________________`,
      ``,
      `  Tasking Agency Instructions:`,
      `    _______________________________________________________________`,
      ``,
      `  Specialty Team Requested:`,
      `    _______________________________________________________________`,
      ``,
      `  Requests of Tasking Agency:`,
      `    _______________________________________________________________`,
      ``,
      `  Other:`,
      `    _______________________________________________________________`,
      ``,
      `  Social media  ☐ Yes  ☐ No`,
    ].join('\n');

    const page2 = [
      header('First Notice – PERSON  (Page 2)'),
      `  Missing Person Behavior Category and Notes:`,
      `  (Category: ________________________________________________)`,
      ``,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      ``,
      `  Contingencies (Weather, Dark, Convergent Volunteers Likely):`,
      ``,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
      `  _______________________________________________________________`,
    ].join('\n');

    const briefing = [
      header('Briefing Information Sheet'),
      `  Name of Missing Person: ${op.lost_person_name ?? '_______________________________________________'}`,
      `  Date Last Seen: ${lastSeenDate.padEnd(20)} Time Last Seen: ${lastSeenTime.padEnd(20)} Place: ${lastSeenPlace || '_______________'}`,
      `  Age: ${op.lost_person_age ? String(op.lost_person_age).padEnd(12) : '_______'} Height: _______________   Weight: _______________`,
      `  Skin/Hair: _________________________   Clothing: ${op.subject_clothing ?? '_____________________________'}`,
      `  Shoes/Gear: ${op.subject_gear ?? '______________________________________________________'}`,
      ``,
      `  Circumstances:`,
      `    ${op.subject_circumstance ?? '_______________________________________________________________'}`,
      ``,
      `  Health Concerns:`,
      `    ${op.subject_condition ?? '_______________________________________________________________'}`,
      ``,
      `  Safety Concerns:`,
      `    ${op.safety_concerns ?? '_______________________________________________________________'}`,
      ``,
      `  Relevant History:`,
      `    _______________________________________________________________`,
      ``,
      `  Current Weather: ___________   Temp: _______  Wind: _______  Precip: _______`,
      `  Forecast Weather: __________   Temp: _______  Wind: _______  Precip: _______`,
      ``,
      `  Volunteers on Scene: ____   Family on Scene: ____   Media on Scene: ____   CISM: ____`,
      ``,
      `  Required Team Equipment: _______________________________________________`,
      `  Required Personal Equipment: __________________________________________`,
      ``,
      `  CP Frequency: ________   CP Phone: 403 928 1231   Drop Dead Time: ________   Emergency Code: No Duff`,
      ``,
      `  IPP (${op.ipp_type?.toUpperCase() ?? 'LKP'}): ${lastSeenPlace || '_______________'}   UTM: ${ippUtm ?? '_______________'}`,
      `  CalTopo: ${op.caltopo_map_id ? `https://caltopo.com/m/${op.caltopo_map_id}` : 'N/A'}`,
    ].join('\n');

    return [page1, '', page2, '', briefing].join('\n');
  }

  function turnout(): string {
    if (!op) return '';
    const responding = checkins.filter(c => c.fit_for_field);
    const support = checkins.filter(c => !c.fit_for_field);
    const drivers = checkins.filter(c => c.vehicle_role === 'driver');
    return [
      `SEASAR TURN-OUT RECORD`,
      `Incident: ${op.name}`,
      `Activation: ${fmt(op.deploy_timestamp)}`,
      `D4H Incident: ${op.d4h_incident_id ?? 'N/A'}`,
      ``,
      `RESPONDING (field): ${responding.length}`,
      responding.map(c => `  ${c.searcher_name} — ${c.vehicle_name ?? 'own transport'}`).join('\n'),
      ``,
      `BASE / SUPPORT: ${support.length}`,
      support.map(c => `  ${c.searcher_name}`).join('\n') || '  none',
      ``,
      `VEHICLES DEPLOYED: ${drivers.length}`,
      drivers.map(c => `  ${c.vehicle_name ?? '—'} — Driver: ${c.searcher_name}`).join('\n') || '  none',
      ``,
      `TOTAL PERSONNEL: ${checkins.length}`,
      `OPERATION DURATION: ${elapsed(op.started_at, op.ended_at)}`,
      ``,
      `OUTCOME: ${outcome.toUpperCase()}`,
      outcomeNote ? `Notes: ${outcomeNote}` : '',
      ``,
      `IC Signature: ___________________________  Date: _______________`,
    ].filter(l => l !== undefined).join('\n');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !user || fetching) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;
  if (!op) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-red-500">Operation not found.</p></div>;
  if (closed) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-green-600 font-semibold">Operation closed. Returning…</p></div>;

  const DOCS = [
    { id: 'fn1', label: 'SEASAR First Notice (Person + Briefing)', fn: seasarFirstNotice },
    { id: 'ics201', label: 'ICS 201 — Incident Briefing', fn: ics201 },
    { id: 'ics204', label: 'ICS 204 — Assignment List', fn: ics204 },
    { id: 'ics211', label: 'ICS 211 — Check-In List', fn: ics211 },
    { id: 'turnout', label: 'SEASAR Turn-Out Record', fn: turnout },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.push('/operations')} className="hover:text-gray-700">← Operations</button>
          <span>/</span>
          <button onClick={() => router.push(`/operations/${id}`)} className="hover:text-gray-700 truncate">{op.name}</button>
          <span>/</span>
          <span className="text-gray-700 font-medium">Close Operation</span>
        </div>

        {/* Header */}
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-red-500">
          <h1 className="text-xl font-bold text-gray-800">Close Operation</h1>
          <p className="text-sm text-gray-500 mt-0.5">{op.name} · {elapsed(op.started_at)} elapsed</p>
        </div>

        {/* Closure details */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Closure Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
            <div className="flex flex-wrap gap-2">
              {([
                { val: 'located', label: 'Subject Located' },
                { val: 'suspended', label: 'Search Suspended' },
                { val: 'cancelled', label: 'Cancelled / Stand Down' },
                { val: 'other', label: 'Other' },
              ] as const).map(({ val, label }) => (
                <button key={val} type="button" onClick={() => setOutcome(val)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${outcome === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outcome notes</label>
            <textarea value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)} rows={2}
              placeholder="e.g. Subject located at GPS 12U 350500E 5608000N, transported by AHS"
              className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Incident Commander', val: incidentCommander, set: setIncidentCommander },
              { label: 'Operations Chief', val: opsChief, set: setOpsChief },
              { label: 'Planning Chief', val: planningChief, set: setPlanningChief },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input value={val} onChange={e => set(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">General remarks / lessons learned</label>
            <textarea value={closingNote} onChange={e => setClosingNote(e.target.value)} rows={3}
              placeholder="Debrief notes, lessons learned, follow-up actions…"
              className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        {/* Document generation */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Generate Documents</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {DOCS.map(doc => (
              <button key={doc.id} type="button"
                onClick={() => setActiveDoc(activeDoc === doc.id ? null : doc.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${activeDoc === doc.id ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {doc.label}
              </button>
            ))}
          </div>

          {activeDoc && (() => {
            const doc = DOCS.find(d => d.id === activeDoc)!;
            const text = doc.fn();
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{doc.label}</span>
                  <button onClick={() => copy(text, doc.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition-colors">
                    {copied === doc.id ? '✓ Copied' : 'Copy to clipboard'}
                  </button>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap text-gray-800 leading-relaxed max-h-80 overflow-y-auto">
                  {text}
                </pre>
              </div>
            );
          })()}
        </div>

        {/* Operation summary */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Operation Summary</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {[
              ['Subject', op.lost_person_name],
              ['Agency', op.tasking_agency],
              ['Started', fmt(op.started_at)],
              ['Duration', elapsed(op.started_at)],
              ['Tasks run', String(tasks.length)],
              ['Searchers checked in', String(checkins.length)],
              ['D4H Incident', op.d4h_incident_id ?? 'N/A'],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-gray-500 font-medium">{k}</span>
                <span className="text-gray-800">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Close button */}
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-red-400">
          <p className="text-sm text-gray-600 mb-4">
            Closing this operation is permanent. All tasks and personnel will be marked as complete. Generate and save your documents above before proceeding.
          </p>
          <button onClick={closeOperation} disabled={closing}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
            {closing ? 'Closing…' : 'Close Operation'}
          </button>
        </div>

      </div>
    </div>
  );
}
