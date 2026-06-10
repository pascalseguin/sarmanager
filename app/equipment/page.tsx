'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/lib/settings-context';

// ── D4H equipment type ────────────────────────────────────────────────────────

interface D4HEquipmentItem {
  id: number;
  title: string;
  ref?: string;
  notes?: string;
  status?: string;
  category?: { title?: string };
}

// ── Local inspection types ────────────────────────────────────────────────────

interface InspField {
  id: string;
  label: string;
  type: 'pass_fail' | 'text' | 'number';
  required: boolean;
}

interface InspTemplate {
  id: string;
  name: string;
  description: string;
  fields: InspField[];
  createdAt: string;
}

interface FieldResult {
  fieldId: string;
  label: string;
  value: string | boolean;
}

interface InspResult {
  id: string;
  templateId: string;
  templateName: string;
  equipmentId: number;
  equipmentName: string;
  completedBy: string;
  completedAt: string;
  fieldResults: FieldResult[];
  overallPassed: boolean;
  // Operation linking
  operationId?: string;
  operationName?: string;
  d4hSynced?: boolean;
  d4hActivityId?: number;
  d4hSyncedAt?: string;
}

// ── Local storage helpers ─────────────────────────────────────────────────────

const TMPL_KEY    = 'sarmanager_insp_templates';
const ASSIGN_KEY  = 'sarmanager_insp_assignments'; // equipmentId(string) → templateId[]
export const RESULTS_KEY = 'sarmanager_insp_results';

const loadTemplates  = (): InspTemplate[] => { try { return JSON.parse(localStorage.getItem(TMPL_KEY)    ?? '[]'); } catch { return []; } };
const loadAssignments = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) ?? '{}'); } catch { return {}; } };
const loadResults    = (): InspResult[]   => { try { return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '[]'); } catch { return []; } };
const saveTemplates   = (t: InspTemplate[])            => localStorage.setItem(TMPL_KEY,    JSON.stringify(t));
const saveAssignments = (a: Record<string, string[]>)  => localStorage.setItem(ASSIGN_KEY,  JSON.stringify(a));
const saveResults     = (r: InspResult[])              => localStorage.setItem(RESULTS_KEY, JSON.stringify(r));

function patchResult(id: string, patch: Partial<InspResult>) {
  try {
    const all = loadResults();
    const idx = all.findIndex(r => r.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; saveResults(all); }
  } catch { /* empty */ }
}

// ── Quick check constants ─────────────────────────────────────────────────────

const QUICK_CHECKS = [
  'Fuel adequate',
  'Engine oil OK',
  'All lights working',
  'Tires OK — no damage or low pressure',
  'Safety kit present (first aid, fire ext.)',
  'Radio / comms functional',
  'GPS / navigation functional',
  'Seatbelts OK',
  'No visible body damage',
  'PPE and gear loaded',
];
const CONDITIONS = ['Good', 'Fair — minor issues', 'Poor — flag for maintenance'] as const;

function formatQuickCheckNote(
  item: D4HEquipmentItem,
  inspector: string,
  condition: string,
  fuel: string,
  checks: Record<string, boolean>,
  notes: string,
): string {
  const ts = new Date().toLocaleString('en-CA', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const lines = [
    `── QUICK CHECK: ${ts} ──`,
    `Inspector: ${inspector || 'unknown'}`,
    `Condition: ${condition}`,
    `Fuel: ${fuel}`,
    '',
    ...QUICK_CHECKS.map(c => `${checks[c] ? '✓' : '✗'} ${c}`),
  ];
  if (notes.trim()) lines.push('', `Notes: ${notes.trim()}`);
  return lines.join('\n');
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const { settings } = useSettings();
  const d4hToken = settings.d4hToken;
  const configured = Boolean(d4hToken);

  const [tab, setTab] = useState<'registry' | 'presets' | 'quickcheck' | 'inspections'>('registry');
  const [equipment, setEquipment] = useState<D4HEquipmentItem[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [eqError, setEqError] = useState('');

  const d4hTeamId = settings.d4hTeamId;
  const callD4H = useCallback(async (action: string, extra: object = {}) => {
    const res = await fetch('/api/d4h', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: d4hToken, ...(d4hTeamId ? { teamId: Number(d4hTeamId) } : {}), ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'D4H error');
    return data;
  }, [d4hToken, d4hTeamId]);

  async function loadEquipment() {
    if (!configured) return;
    setLoadingEq(true); setEqError('');
    try {
      const data = await callD4H('getEquipment');
      setEquipment(data.equipment ?? []);
    } catch (e: unknown) {
      setEqError(e instanceof Error ? e.message : 'Failed to load equipment');
    } finally {
      setLoadingEq(false);
    }
  }

  useEffect(() => { loadEquipment(); }, [configured]);

  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarmanager_session_token') ?? '') : '';

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Equipment</h1>
          {(tab === 'quickcheck' || tab === 'inspections') && (
            <button onClick={loadEquipment} disabled={loadingEq}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50">
              {loadingEq ? 'Loading…' : '↺ Refresh D4H'}
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-white rounded-xl shadow p-1 mb-4 overflow-x-auto">
          {([
            { id: 'registry',    label: '📦 Registry' },
            { id: 'presets',     label: '🗂 Presets' },
            { id: 'quickcheck',  label: 'Quick Check' },
            { id: 'inspections', label: 'Inspections' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {eqError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{eqError}</div>
        )}

        {tab === 'registry' && <RegistryTab token={token} />}
        {tab === 'presets'  && <PresetsTab token={token} />}

        {tab === 'quickcheck' && !configured && (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
            <p className="mb-2">D4H token not configured.</p>
            <a href="/settings" className="text-sm text-blue-600 hover:underline">Go to Settings →</a>
          </div>
        )}
        {tab === 'quickcheck' && configured && (
          <QuickCheckTab equipment={equipment} loading={loadingEq} callD4H={callD4H} />
        )}
        {tab === 'inspections' && !configured && (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
            <p className="mb-2">D4H token not configured.</p>
            <a href="/settings" className="text-sm text-blue-600 hover:underline">Go to Settings →</a>
          </div>
        )}
        {tab === 'inspections' && configured && (
          <InspectionsTab equipment={equipment} loading={loadingEq} callD4H={callD4H} />
        )}
      </div>
    </div>
  );
}

// ── Quick Check Tab ───────────────────────────────────────────────────────────

function QuickCheckTab({
  equipment, loading, callD4H,
}: {
  equipment: D4HEquipmentItem[];
  loading: boolean;
  callD4H: (action: string, extra?: object) => Promise<Record<string, unknown>>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [inspector, setInspector] = useState('');
  const [condition, setCondition] = useState<string>(CONDITIONS[0]);
  const [fuel, setFuel] = useState('Full');
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(QUICK_CHECKS.map(c => [c, true]))
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState('');

  const selected = equipment.find(e => e.id === selectedId);

  async function submit() {
    if (!selected || !inspector.trim()) return;
    setSubmitting(true); setError(''); setSubmitted('');
    try {
      const note = formatQuickCheckNote(selected, inspector, condition, fuel, checks, notes);
      const isPoor = condition.startsWith('Poor');

      // Try D4H — best-effort, never blocks completion
      let d4hSynced = false;
      await callD4H('logEquipmentUsage', { equipmentId: selected.id, notes: note })
        .then(() => { d4hSynced = true; })
        .catch(() => {});

      if (d4hSynced) {
        await callD4H('updateEquipmentStatus', {
          equipmentId: selected.id,
          status: isPoor ? 'Unserviceable' : 'Operational',
          notes: note,
        }).catch(() => {});

        if (isPoor) {
          await callD4H('createRepairTicket', {
            equipmentId: selected.id,
            title: `Failed Quick Check — ${selected.title}`,
            description: `Item flagged as unserviceable by ${inspector} during quick check.\n\n${note}`,
          }).catch(() => {});
        }
      }

      setSubmitted(
        d4hSynced
          ? new Date().toLocaleTimeString('en-CA')
          : `${new Date().toLocaleTimeString('en-CA')} — saved locally (D4H sync needs a linked operation)`
      );
      setNotes('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center text-gray-500 py-12">Loading equipment from D4H…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select equipment item</label>
        <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
          <option value="">— choose equipment —</option>
          {equipment.map(item => (
            <option key={item.id} value={item.id}>
              {item.title}{item.ref ? ` (${item.ref})` : ''}{item.category?.title ? ` · ${item.category.title}` : ''}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div className="text-base font-semibold text-gray-800">{selected.title}</div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inspector name *</label>
            <input value={inspector} onChange={e => setInspector(e.target.value)} placeholder="Your name"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Overall condition</label>
            <div className="flex gap-2 flex-wrap">
              {CONDITIONS.map(c => (
                <button key={c} onClick={() => setCondition(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    condition === c
                      ? c.startsWith('Good') ? 'bg-green-600 text-white border-green-600'
                        : c.startsWith('Fair') ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-red-600 text-white border-red-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel level</label>
            <div className="flex gap-2 flex-wrap">
              {['Full', '3/4', '1/2', '1/4', 'Low'].map(f => (
                <button key={f} onClick={() => setFuel(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    fuel === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>{f}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pre-departure checklist</label>
            <div className="space-y-2">
              {QUICK_CHECKS.map(c => (
                <label key={c} className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setChecks(prev => ({ ...prev, [c]: !prev[c] }))}
                    className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold shrink-0 cursor-pointer transition-colors ${
                      checks[c] ? 'bg-green-500 text-white' : 'bg-red-100 border-2 border-red-400 text-red-500'
                    }`}>{checks[c] ? '✓' : '✗'}</div>
                  <span className={`text-sm ${checks[c] ? 'text-gray-700' : 'text-red-600 font-medium'}`}>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Any issues, observations, or follow-up items…"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {submitted && <p className="text-sm text-green-600">✓ Submitted to D4H notes at {submitted}</p>}

          <button onClick={submit} disabled={submitting || !inspector.trim()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting…' : 'Submit Quick Check → D4H Notes'}
          </button>
        </div>
      )}

      {equipment.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-8 bg-white rounded-xl shadow">
          <p>No equipment found in D4H.</p>
        </div>
      )}
    </div>
  );
}

// ── Inspections Tab ───────────────────────────────────────────────────────────

type D4HCallFn = (action: string, extra?: object) => Promise<Record<string, unknown>>;

function InspectionsTab({
  equipment, loading, callD4H,
}: {
  equipment: D4HEquipmentItem[];
  loading: boolean;
  callD4H: D4HCallFn;
}) {
  const [subTab, setSubTab] = useState<'complete' | 'manage' | 'history'>('complete');
  const [templates, setTemplates]     = useState<InspTemplate[]>(loadTemplates);
  const [assignments, setAssignments] = useState<Record<string, string[]>>(loadAssignments);
  const [results, setResults]         = useState<InspResult[]>(loadResults);

  function updateTemplates(next: InspTemplate[])            { saveTemplates(next);   setTemplates(next); }
  function updateAssignments(next: Record<string, string[]>){ saveAssignments(next); setAssignments(next); }
  function addResult(r: InspResult)                         { const next = [r, ...results]; saveResults(next); setResults(next); }

  if (loading) return <div className="text-center text-gray-500 py-12">Loading equipment…</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white rounded-xl shadow p-1">
        {([
          { id: 'complete', label: 'Complete Inspection' },
          { id: 'manage',   label: 'Manage' },
          { id: 'history',  label: 'History' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'complete' && (
        <CompleteInspection
          equipment={equipment}
          templates={templates}
          assignments={assignments}
          onResult={addResult}
          callD4H={callD4H}
        />
      )}
      {subTab === 'manage' && (
        <ManageInspections
          equipment={equipment}
          templates={templates}
          assignments={assignments}
          onTemplatesChange={updateTemplates}
          onAssignmentsChange={updateAssignments}
        />
      )}
      {subTab === 'history' && (
        <InspectionHistory results={results} equipment={equipment} templates={templates} />
      )}
    </div>
  );
}

// ── Complete Inspection ───────────────────────────────────────────────────────

function CompleteInspection({
  equipment, templates, assignments, onResult, callD4H,
}: {
  equipment: D4HEquipmentItem[];
  templates: InspTemplate[];
  assignments: Record<string, string[]>;
  onResult: (r: InspResult) => void;
  callD4H: D4HCallFn;
}) {
  const [selectedEqId, setSelectedEqId] = useState<number | null>(null);
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  const [inspector, setInspector] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const selectedEq  = equipment.find(e => e.id === selectedEqId);
  const assignedIds = selectedEqId ? (assignments[String(selectedEqId)] ?? []) : [];
  const assignedTemplates = templates.filter(t => assignedIds.includes(t.id));
  const selectedTpl = assignedTemplates.find(t => t.id === selectedTplId) ?? null;

  // Reset template when equipment changes
  useEffect(() => { setSelectedTplId(null); setFieldValues({}); setSaved(''); setError(''); }, [selectedEqId]);
  useEffect(() => { setFieldValues({}); setSaved(''); setError(''); }, [selectedTplId]);

  function setField(fieldId: string, value: string | boolean) {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  }

  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!selectedEq || !selectedTpl || !inspector.trim()) return;
    setError(''); setSubmitting(true);
    try {
      const fieldResults: FieldResult[] = selectedTpl.fields.map(f => ({
        fieldId: f.id,
        label: f.label,
        value: fieldValues[f.id] ?? (f.type === 'pass_fail' ? true : ''),
      }));
      const overallPassed = fieldResults.every(r =>
        typeof r.value === 'boolean' ? r.value : true
      );
      const result: InspResult = {
        id: crypto.randomUUID(),
        templateId: selectedTpl.id,
        templateName: selectedTpl.name,
        equipmentId: selectedEq.id,
        equipmentName: selectedEq.title,
        completedBy: inspector.trim(),
        completedAt: new Date().toISOString(),
        fieldResults,
        overallPassed,
      };

      // Save locally — this is the authoritative record
      onResult(result);
      setSaved(new Date().toLocaleTimeString('en-CA'));
      setFieldValues({});

      // Push to D4H best-effort — write back sync status to localStorage
      const noteLines = [
        `Inspection: ${selectedTpl.name}`,
        `Inspector: ${inspector.trim()}`,
        `Result: ${overallPassed ? 'PASS' : 'FAIL'}`,
        '',
        ...fieldResults.map(f =>
          typeof f.value === 'boolean'
            ? `${f.value ? '✓' : '✗'} ${f.label}`
            : `${f.label}: ${f.value}`
        ),
      ];
      const notes = noteLines.join('\n');

      let d4hSynced = false;
      await callD4H('logEquipmentUsage', { equipmentId: selectedEq.id, notes })
        .then(() => { d4hSynced = true; })
        .catch(() => {});

      if (d4hSynced) {
        patchResult(result.id, { d4hSynced: true, d4hSyncedAt: new Date().toISOString() });
        await callD4H('updateEquipmentStatus', {
          equipmentId: selectedEq.id,
          status: overallPassed ? 'Operational' : 'Unserviceable',
          notes,
        }).catch(() => {});
        if (!overallPassed) {
          const failedChecks = fieldResults.filter(f => f.value === false).map(f => f.label).join(', ');
          await callD4H('createRepairTicket', {
            equipmentId: selectedEq.id,
            title: `Failed Inspection — ${selectedEq.title}`,
            description: `Failed "${selectedTpl.name}" inspection by ${inspector.trim()}.\nFailed checks: ${failedChecks}\n\n${notes}`,
          }).catch(() => {});
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save inspection');
    } finally {
      setSubmitting(false);
    }
  }

  // Equipment filtered to those with at least one template assigned
  const assignedEquipment = equipment.filter(e => (assignments[String(e.id)] ?? []).length > 0);

  if (assignedEquipment.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500 text-sm">
        <p className="font-medium mb-1">No equipment has inspection templates assigned.</p>
        <p>Go to <strong>Manage</strong> to create templates and assign them to equipment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1 — equipment */}
      <div className="bg-white rounded-xl shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">1 — Select equipment</label>
        <select value={selectedEqId ?? ''} onChange={e => setSelectedEqId(e.target.value ? Number(e.target.value) : null)}
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
          <option value="">— choose equipment —</option>
          {assignedEquipment.map(item => (
            <option key={item.id} value={item.id}>
              {item.title}{item.ref ? ` (${item.ref})` : ''}{item.category?.title ? ` · ${item.category.title}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Step 2 — template */}
      {selectedEq && (
        <div className="bg-white rounded-xl shadow p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">2 — Select inspection template</label>
          {assignedTemplates.length === 0 ? (
            <p className="text-sm text-gray-500">No templates assigned to this item.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignedTemplates.map(t => (
                <button key={t.id} onClick={() => setSelectedTplId(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedTplId === t.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>{t.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3 — form */}
      {selectedEq && selectedTpl && (
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div className="text-base font-semibold text-gray-800">
            3 — {selectedEq.title} · {selectedTpl.name}
          </div>
          {selectedTpl.description && (
            <p className="text-sm text-gray-500">{selectedTpl.description}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inspector name *</label>
            <input value={inspector} onChange={e => setInspector(e.target.value)} placeholder="Your name"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>

          <div className="space-y-3">
            {selectedTpl.fields.map(f => (
              <div key={f.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-800 mb-2">
                  {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                </div>
                {f.type === 'pass_fail' && (
                  <div className="flex gap-2">
                    <button onClick={() => setField(f.id, true)}
                      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                        (fieldValues[f.id] ?? true) === true ? 'bg-green-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>Pass</button>
                    <button onClick={() => setField(f.id, false)}
                      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                        fieldValues[f.id] === false ? 'bg-red-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>Fail</button>
                  </div>
                )}
                {f.type === 'text' && (
                  <input value={String(fieldValues[f.id] ?? '')} onChange={e => setField(f.id, e.target.value)}
                    placeholder="Enter value…"
                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                )}
                {f.type === 'number' && (
                  <input type="number" value={String(fieldValues[f.id] ?? '')} onChange={e => setField(f.id, e.target.value)}
                    placeholder="0"
                    className="w-40 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">✓ Inspection saved at {saved}</p>}

          <button onClick={submit} disabled={submitting || !inspector.trim()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Pushing to D4H…' : 'Submit Inspection → D4H'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Manage Inspections ────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'pass_fail', label: 'Pass / Fail' },
  { value: 'text',      label: 'Text' },
  { value: 'number',    label: 'Number' },
] as const;

function ManageInspections({
  equipment, templates, assignments, onTemplatesChange, onAssignmentsChange,
}: {
  equipment: D4HEquipmentItem[];
  templates: InspTemplate[];
  assignments: Record<string, string[]>;
  onTemplatesChange: (t: InspTemplate[]) => void;
  onAssignmentsChange: (a: Record<string, string[]>) => void;
}) {
  const [manageTab, setManageTab] = useState<'templates' | 'assign'>('templates');
  const [showCreate, setShowCreate] = useState(false);

  // ── template creation form state ──
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplFields, setTplFields] = useState<{ label: string; type: InspField['type']; required: boolean }[]>([
    { label: '', type: 'pass_fail', required: true },
  ]);

  // ── assignment state ──
  const [assignTplId, setAssignTplId] = useState<string>('');
  const [assignSel, setAssignSel] = useState<Set<number>>(new Set());

  function addField() {
    setTplFields(prev => [...prev, { label: '', type: 'pass_fail', required: true }]);
  }
  function removeField(i: number) {
    setTplFields(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateField(i: number, key: string, value: string | boolean) {
    setTplFields(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: value } : f));
  }

  function saveTemplate() {
    if (!tplName.trim() || tplFields.some(f => !f.label.trim())) return;
    const tpl: InspTemplate = {
      id: crypto.randomUUID(),
      name: tplName.trim(),
      description: tplDesc.trim(),
      fields: tplFields.map(f => ({ ...f, id: crypto.randomUUID() })),
      createdAt: new Date().toISOString(),
    };
    onTemplatesChange([...templates, tpl]);
    setTplName(''); setTplDesc('');
    setTplFields([{ label: '', type: 'pass_fail', required: true }]);
    setShowCreate(false);
  }

  function deleteTemplate(id: string) {
    onTemplatesChange(templates.filter(t => t.id !== id));
    // remove from all assignments
    const next: Record<string, string[]> = {};
    for (const [eqId, ids] of Object.entries(assignments)) {
      const filtered = ids.filter(tid => tid !== id);
      if (filtered.length) next[eqId] = filtered;
    }
    onAssignmentsChange(next);
  }

  // When assignment template selection changes, pre-populate checkboxes
  useEffect(() => {
    if (!assignTplId) { setAssignSel(new Set()); return; }
    const alreadyAssigned = Object.entries(assignments)
      .filter(([, ids]) => ids.includes(assignTplId))
      .map(([eqId]) => Number(eqId));
    setAssignSel(new Set(alreadyAssigned));
  }, [assignTplId]);

  function toggleAssignEq(eqId: number) {
    setAssignSel(prev => {
      const next = new Set(prev);
      next.has(eqId) ? next.delete(eqId) : next.add(eqId);
      return next;
    });
  }

  function selectAllEquipment() { setAssignSel(new Set(equipment.map(e => e.id))); }
  function clearAllEquipment()  { setAssignSel(new Set()); }

  function saveAssignment() {
    if (!assignTplId) return;
    const next = { ...assignments };
    for (const eq of equipment) {
      const eqKey = String(eq.id);
      const cur = new Set(next[eqKey] ?? []);
      if (assignSel.has(eq.id)) cur.add(assignTplId);
      else cur.delete(assignTplId);
      if (cur.size) next[eqKey] = [...cur];
      else delete next[eqKey];
    }
    onAssignmentsChange(next);
  }

  return (
    <div className="space-y-4">
      {/* Manage sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setManageTab('templates')}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${manageTab === 'templates' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Templates
        </button>
        <button onClick={() => setManageTab('assign')}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${manageTab === 'assign' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Assign to Assets
        </button>
      </div>

      {/* ── Templates panel ── */}
      {manageTab === 'templates' && (
        <div className="space-y-3">
          {templates.length === 0 && !showCreate && (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500 text-sm">
              No inspection templates yet. Create one below.
            </div>
          )}

          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-800">{t.name}</div>
                  {t.description && <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.fields.map(f => (
                      <span key={f.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {f.label} ({f.type === 'pass_fail' ? 'P/F' : f.type})
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteTemplate(t.id); }}
                  className="text-sm text-red-500 hover:text-red-700 shrink-0 font-medium">Delete</button>
              </div>
            </div>
          ))}

          {showCreate ? (
            <div className="bg-white rounded-xl shadow p-5 border-2 border-blue-400 space-y-3">
              <div className="font-semibold text-gray-800">New Inspection Template</div>

              <input value={tplName} onChange={e => setTplName(e.target.value)}
                placeholder="Template name (e.g. Vehicle Pre-Departure)"
                className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={tplDesc} onChange={e => setTplDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Fields</div>
                {tplFields.map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={f.label} onChange={e => updateField(i, 'label', e.target.value)}
                      placeholder={`Field ${i + 1} label`}
                      className="flex-1 p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={f.type} onChange={e => updateField(i, 'type', e.target.value)}
                      className="p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                      <input type="checkbox" checked={f.required} onChange={e => updateField(i, 'required', e.target.checked)} />
                      Req
                    </label>
                    {tplFields.length > 1 && (
                      <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-xl font-bold px-1 shrink-0">×</button>
                    )}
                  </div>
                ))}
                <button onClick={addField} className="text-sm text-blue-600 hover:underline">+ Add field</button>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={saveTemplate}
                  disabled={!tplName.trim() || tplFields.some(f => !f.label.trim())}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  Save Template
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCreate(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Create Inspection Template
            </button>
          )}
        </div>
      )}

      {/* ── Assign panel ── */}
      {manageTab === 'assign' && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500 text-sm">
              Create inspection templates first.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select template to assign</label>
                <div className="flex flex-wrap gap-2">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => setAssignTplId(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        assignTplId === t.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>{t.name}</button>
                  ))}
                </div>
              </div>

              {assignTplId && (
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-gray-700">
                      Assign <strong>{templates.find(t => t.id === assignTplId)?.name}</strong> to:
                    </div>
                    <div className="flex gap-2">
                      <button onClick={selectAllEquipment} className="text-xs text-blue-600 hover:underline">All</button>
                      <button onClick={clearAllEquipment}  className="text-xs text-gray-500 hover:underline">None</button>
                    </div>
                  </div>

                  {equipment.length === 0 ? (
                    <p className="text-sm text-gray-500">No equipment loaded from D4H.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      {equipment.map((item, i) => (
                        <label key={item.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${assignSel.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                          <input type="checkbox" checked={assignSel.has(item.id)} onChange={() => toggleAssignEq(item.id)}
                            className="w-4 h-4 accent-blue-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                            {(item.ref || item.category?.title) && (
                              <div className="text-xs text-gray-500">{[item.ref, item.category?.title].filter(Boolean).join(' · ')}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  <button onClick={saveAssignment}
                    className="mt-3 w-full py-2.5 bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-gray-900 transition-colors">
                    Save Assignment ({assignSel.size} item{assignSel.size !== 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inspection History ────────────────────────────────────────────────────────

function InspectionHistory({
  results, equipment, templates,
}: {
  results: InspResult[];
  equipment: D4HEquipmentItem[];
  templates: InspTemplate[];
}) {
  const [filterEq, setFilterEq] = useState('');
  const [filterTpl, setFilterTpl] = useState('');

  const filtered = results.filter(r =>
    (!filterEq  || String(r.equipmentId) === filterEq) &&
    (!filterTpl || r.templateId === filterTpl)
  );

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500 text-sm">
        No inspections completed yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3">
        <select value={filterEq} onChange={e => setFilterEq(e.target.value)}
          className="p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All equipment</option>
          {equipment.map(e => <option key={e.id} value={String(e.id)}>{e.title}</option>)}
        </select>
        <select value={filterTpl} onChange={e => setFilterTpl(e.target.value)}
          className="p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All templates</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {(filterEq || filterTpl) && (
          <button onClick={() => { setFilterEq(''); setFilterTpl(''); }}
            className="text-sm text-gray-500 hover:text-gray-700">Clear</button>
        )}
      </div>

      {/* Results list */}
      <div className="space-y-3">
        {filtered.map(r => (
          <div key={r.id} className={`bg-white rounded-xl shadow p-4 border-l-4 ${r.overallPassed ? 'border-green-500' : 'border-red-500'}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800">{r.equipmentName}</div>
                <div className="text-xs text-gray-500">{r.templateName} · {r.completedBy} · {new Date(r.completedAt).toLocaleString('en-CA')}</div>
                {r.operationName && (
                  <div className="text-xs text-blue-600 mt-0.5">Linked: {r.operationName}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.overallPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {r.overallPassed ? 'PASS' : 'FAIL'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.d4hSynced ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {r.d4hSynced ? 'D4H ✓' : 'pending'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {r.fieldResults.map(f => (
                <div key={f.fieldId} className="flex items-center gap-2 text-sm">
                  {typeof f.value === 'boolean' ? (
                    <span className={`text-xs font-medium ${f.value ? 'text-green-600' : 'text-red-600'}`}>
                      {f.value ? '✓' : '✗'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                  <span className="text-gray-700">{f.label}</span>
                  {typeof f.value !== 'boolean' && f.value && (
                    <span className="text-gray-500">: {String(f.value)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Equipment Registry Tab ────────────────────────────────────────────────────

interface LocalEquipment {
  id: string; name: string; brand?: string; model?: string; serial?: string;
  barcode?: string; ref?: string; type?: string; category?: string;
  location?: string; container?: string; status: string; deployable: number;
  notes?: string; tag?: string; d4h_equipment_id?: number;
}

const EQ_TYPES = ['Vehicle','Rope','Medical','Radio','Navigation','Pack','Personal','Technical','Other'];
const EQ_STATUS = ['available','deployed','retired'] as const;

function RegistryTab({ token }: { token: string }) {
  const { settings } = useSettings();
  const [items, setItems]   = useState<LocalEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterContainer, setFilterContainer] = useState('');
  const [containers, setContainers] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<Record<string,string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMsg, setCsvMsg] = useState('');

  const authHdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function load() {
    setLoading(true);
    const [eqRes, cRes] = await Promise.all([
      fetch('/api/equipment', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/equipment/containers', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (eqRes.ok) { const d = await eqRes.json(); setItems(d.equipment ?? []); }
    if (cRes.ok)  { const d = await cRes.json(); setContainers(d.containers ?? []); }
    setLoading(false);
  }

  async function importD4H() {
    if (!settings.d4hToken) { setImportMsg('D4H token not configured in Settings'); return; }
    setImporting(true); setImportMsg('');
    try {
      const res = await fetch('/api/equipment/import-d4h', {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({ token: settings.d4hToken, teamId: settings.d4hTeamId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setImportMsg(`✓ ${d.created} created, ${d.updated} updated (${d.total} total from D4H)`);
      load();
    } catch (e: unknown) { setImportMsg(e instanceof Error ? e.message : 'Import failed'); }
    finally { setImporting(false); }
  }

  async function bulkAction(action: string, extra: object = {}) {
    if (!selected.size) return;
    await fetch('/api/equipment/bulk', {
      method: 'POST', headers: authHdr,
      body: JSON.stringify({ action, ids: [...selected], ...extra }),
    });
    setSelected(new Set()); load();
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this equipment item?')) return;
    await fetch(`/api/equipment/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function parseCsv(text: string): Record<string,string>[] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g,'').trim());
      return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']));
    }).filter(r => r.name);
  }

  async function importCsv() {
    if (!csvPreview.length) return;
    setCsvImporting(true); setCsvMsg('');
    try {
      const res = await fetch('/api/equipment/import-csv', {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({ rows: csvPreview }),
      });
      const d = await res.json();
      setCsvMsg(`✓ ${d.created} created, ${d.skipped} skipped${d.errors?.length ? `, ${d.errors.length} errors` : ''}`);
      setShowCsvImport(false); setCsvText(''); setCsvPreview([]);
      load();
    } catch (e: unknown) { setCsvMsg(e instanceof Error ? e.message : 'Import failed'); }
    finally { setCsvImporting(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterContainer && i.container !== filterContainer) return false;
    if (search) {
      const s = search.toLowerCase();
      return i.name.toLowerCase().includes(s) || (i.tag ?? '').toLowerCase().includes(s) ||
             (i.serial ?? '').toLowerCase().includes(s) || (i.container ?? '').toLowerCase().includes(s);
    }
    return true;
  });

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(i => i.id)));

  if (loading) return <div className="text-center text-gray-500 py-12">Loading registry…</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, tag, serial…"
          className="flex-1 min-w-40 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded p-2 text-sm">
          <option value="">All statuses</option>
          {EQ_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterContainer} onChange={e => setFilterContainer(e.target.value)}
          className="border border-gray-300 rounded p-2 text-sm">
          <option value="">All containers</option>
          {containers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)}
          className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">+ Add</button>
        <button onClick={importD4H} disabled={importing}
          className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">
          {importing ? 'Importing…' : '⟳ Sync D4H'}
        </button>
        <button onClick={() => setShowCsvImport(true)}
          className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">↑ CSV</button>
        {importMsg && <span className="text-xs text-green-600">{importMsg}</span>}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-3 flex-wrap text-sm">
          <span className="font-medium text-blue-700">{selected.size} selected</span>
          <button onClick={() => bulkAction('status', { status: 'deployed' })} className="text-blue-600 hover:underline">Mark Deployed</button>
          <button onClick={() => bulkAction('status', { status: 'available' })} className="text-blue-600 hover:underline">Mark Available</button>
          <button onClick={() => bulkAction('status', { status: 'retired' })} className="text-blue-600 hover:underline">Mark Retired</button>
          <button onClick={() => bulkAction('deployable', { deployable: true })} className="text-blue-600 hover:underline">Set Deployable</button>
          <button onClick={() => { const c = prompt('Container name:'); if (c !== null) bulkAction('container', { container: c || null }); }} className="text-blue-600 hover:underline">Assign Container</button>
          <button onClick={() => { if (confirm(`Delete ${selected.size} items?`)) bulkAction('delete'); }} className="text-red-500 hover:underline">Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-500 hover:underline">Clear</button>
        </div>
      )}

      {/* CSV import panel */}
      {showCsvImport && (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-blue-300 space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">CSV Import</span>
            <button onClick={() => { setShowCsvImport(false); setCsvText(''); setCsvPreview([]); setCsvMsg(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <p className="text-xs text-gray-500">Required column: <code>name</code>. Optional: brand, model, serial, barcode, type, location, container, tag</p>
          <textarea value={csvText} onChange={e => { setCsvText(e.target.value); setCsvPreview(parseCsv(e.target.value)); }}
            rows={6} placeholder="name,brand,type,serial&#10;First Aid Kit,Lifeguard,Medical,SN001"
            className="w-full border border-gray-300 rounded p-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {csvPreview.length > 0 && (
            <p className="text-xs text-gray-600">{csvPreview.length} rows parsed</p>
          )}
          {csvMsg && <p className="text-xs text-green-600">{csvMsg}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowCsvImport(false); setCsvText(''); setCsvPreview([]); }} className="px-3 py-1.5 border rounded text-sm text-gray-600">Cancel</button>
            <button onClick={importCsv} disabled={!csvPreview.length || csvImporting}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50">
              {csvImporting ? 'Importing…' : `Import ${csvPreview.length} rows`}
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showAdd && (
        <EquipmentForm
          token={token}
          onSaved={() => { setShowAdd(false); load(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-3 text-xs font-medium text-gray-500 uppercase">
          <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
            onChange={toggleAll} className="w-3.5 h-3.5" />
          <span className="flex-1">Name ({filtered.length})</span>
          <span className="w-24 hidden sm:block">Type</span>
          <span className="w-28 hidden md:block">Container</span>
          <span className="w-20">Status</span>
          <span className="w-16">Deploy</span>
          <span className="w-16">Actions</span>
        </div>
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            {items.length === 0 ? 'No equipment yet — add one or sync from D4H.' : 'No items match the filter.'}
          </div>
        )}
        {filtered.map(item => (
          editId === item.id ? (
            <div key={item.id} className="border-b">
              <EquipmentForm
                token={token}
                existing={item}
                onSaved={() => { setEditId(null); load(); }}
                onCancel={() => setEditId(null)}
                inline
              />
            </div>
          ) : (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm hover:bg-gray-50 ${selected.has(item.id) ? 'bg-blue-50' : ''}`}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-3.5 h-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 truncate">{item.name}</div>
                <div className="text-xs text-gray-400">{[item.tag, item.serial, item.ref].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="w-24 text-xs text-gray-500 hidden sm:block truncate">{item.type ?? '—'}</span>
              <span className="w-28 text-xs text-gray-500 hidden md:block truncate">{item.container ?? '—'}</span>
              <span className={`w-20 text-xs font-medium px-2 py-0.5 rounded-full text-center ${
                item.status === 'available' ? 'bg-green-100 text-green-700' :
                item.status === 'deployed' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-500'}`}>
                {item.status}
              </span>
              <span className="w-16 text-center text-xs">{item.deployable ? '✓' : '—'}</span>
              <div className="w-16 flex gap-1 shrink-0">
                <button onClick={() => setEditId(item.id)} className="text-xs text-blue-600 hover:underline">Edit</button>
                <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function EquipmentForm({ token, existing, onSaved, onCancel, inline }: {
  token: string; existing?: LocalEquipment;
  onSaved: () => void; onCancel: () => void; inline?: boolean;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    brand: existing?.brand ?? '',
    model: existing?.model ?? '',
    serial: existing?.serial ?? '',
    barcode: existing?.barcode ?? '',
    ref: existing?.ref ?? '',
    type: existing?.type ?? '',
    category: existing?.category ?? '',
    location: existing?.location ?? '',
    container: existing?.container ?? '',
    status: existing?.status ?? 'available',
    deployable: existing?.deployable ?? 0,
    notes: existing?.notes ?? '',
    tag: existing?.tag ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const url = existing ? `/api/equipment/${existing.id}` : '/api/equipment';
    const method = existing ? 'PATCH' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, deployable: form.deployable ? 1 : 0 }),
    });
    setSaving(false);
    onSaved();
  }

  const cls = 'border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const wrap = inline ? 'p-4 bg-blue-50 space-y-3' : 'bg-white rounded-xl shadow p-4 border-2 border-blue-300 space-y-3';

  return (
    <div className={wrap}>
      <div className="text-sm font-semibold text-gray-800">{existing ? 'Edit Equipment' : 'Add Equipment'}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ['Name *', 'name'], ['Brand', 'brand'], ['Model', 'model'], ['Serial', 'serial'],
          ['Barcode', 'barcode'], ['Ref / Asset #', 'ref'], ['Location', 'location'], ['Container', 'container'],
          ['Tag (QR)', 'tag'], ['Notes', 'notes'],
        ].map(([label, key]) => (
          <div key={key} className={key === 'notes' ? 'col-span-2' : ''}>
            <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
            <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className={`w-full ${cls}`} />
          </div>
        ))}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={`w-full ${cls}`}>
            <option value="">Select…</option>
            {EQ_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={`w-full ${cls}`}>
            {EQ_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input type="checkbox" id="deployable" checked={!!form.deployable}
            onChange={e => setForm(f => ({ ...f, deployable: e.target.checked ? 1 : 0 }))} className="w-4 h-4" />
          <label htmlFor="deployable" className="text-sm text-gray-700">Deployable</label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={save} disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : existing ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ── Presets Tab ───────────────────────────────────────────────────────────────

interface Preset { id: string; name: string; description?: string; containers: string[] }

function PresetsTab({ token }: { token: string }) {
  const [presets, setPresets]   = useState<Preset[]>([]);
  const [containers, setContainers] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [saving, setSaving]     = useState(false);

  const authHdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function load() {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      fetch('/api/equipment/presets',    { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/equipment/containers', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (pRes.ok) { const d = await pRes.json(); setPresets(d.presets ?? []); }
    if (cRes.ok) { const d = await cRes.json(); setContainers(d.containers ?? []); }
    setLoading(false);
  }

  async function createPreset() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/equipment/presets', {
      method: 'POST', headers: authHdr,
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    });
    if (res.ok) { const d = await res.json(); setPresets(prev => [...prev, d.preset]); }
    setNewName(''); setNewDesc(''); setCreating(false); setSaving(false);
  }

  async function deletePreset(id: string) {
    if (!confirm('Delete this preset?')) return;
    await fetch(`/api/equipment/presets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setPresets(prev => prev.filter(p => p.id !== id));
  }

  async function addContainer(presetId: string, container: string) {
    const res = await fetch(`/api/equipment/presets/${presetId}/containers`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ container }),
    });
    if (res.ok) setPresets(prev => prev.map(p => p.id === presetId ? { ...p, containers: [...p.containers, container] } : p));
  }

  async function removeContainer(presetId: string, container: string) {
    await fetch(`/api/equipment/presets/${presetId}/containers`, {
      method: 'DELETE', headers: authHdr, body: JSON.stringify({ container }),
    });
    setPresets(prev => prev.map(p => p.id === presetId ? { ...p, containers: p.containers.filter(c => c !== container) } : p));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-center text-gray-500 py-12">Loading presets…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4">
        <p className="text-sm text-gray-600 mb-3">
          Presets group containers into named deployment packages (e.g. "Tech Truck" = Tech Trailer + Rope Cache).
          When you deploy a preset to an operation, all equipment marked <strong>deployable</strong> in those containers becomes available.
        </p>
      </div>

      {presets.map(preset => (
        <div key={preset.id} className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-semibold text-gray-800 flex-1">{preset.name}</span>
            {preset.description && <span className="text-xs text-gray-500">{preset.description}</span>}
            <button onClick={() => deletePreset(preset.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {preset.containers.map(c => (
              <span key={c} className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                {c}
                <button onClick={() => removeContainer(preset.id, c)} className="hover:text-red-600 ml-1">✕</button>
              </span>
            ))}
            {preset.containers.length === 0 && <span className="text-xs text-gray-400">No containers added yet.</span>}
          </div>
          {containers.length > 0 && (
            <div className="flex gap-2">
              <select className="border border-gray-300 rounded p-1.5 text-sm" defaultValue=""
                onChange={e => { if (e.target.value) { addContainer(preset.id, e.target.value); e.target.value = ''; } }}>
                <option value="" disabled>+ Add container…</option>
                {containers.filter(c => !preset.containers.includes(c)).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {containers.length === 0 && (
            <p className="text-xs text-gray-400">Assign containers to equipment in the Registry tab first.</p>
          )}
        </div>
      ))}

      {creating ? (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-blue-300 space-y-3">
          <div className="text-sm font-semibold">New Preset</div>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Preset name *"
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 border rounded text-sm text-gray-600">Cancel</button>
            <button onClick={createPreset} disabled={saving || !newName.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
          + New Preset
        </button>
      )}
    </div>
  );
}
