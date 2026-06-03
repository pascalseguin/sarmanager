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
}

// ── Local storage helpers ─────────────────────────────────────────────────────

const TMPL_KEY    = 'sarmanager_insp_templates';
const ASSIGN_KEY  = 'sarmanager_insp_assignments'; // equipmentId(string) → templateId[]
const RESULTS_KEY = 'sarmanager_insp_results';

const loadTemplates  = (): InspTemplate[] => { try { return JSON.parse(localStorage.getItem(TMPL_KEY)    ?? '[]'); } catch { return []; } };
const loadAssignments = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) ?? '{}'); } catch { return {}; } };
const loadResults    = (): InspResult[]   => { try { return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '[]'); } catch { return []; } };
const saveTemplates   = (t: InspTemplate[])            => localStorage.setItem(TMPL_KEY,    JSON.stringify(t));
const saveAssignments = (a: Record<string, string[]>)  => localStorage.setItem(ASSIGN_KEY,  JSON.stringify(a));
const saveResults     = (r: InspResult[])              => localStorage.setItem(RESULTS_KEY, JSON.stringify(r));

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

  const [tab, setTab] = useState<'quickcheck' | 'inspections'>('quickcheck');
  const [equipment, setEquipment] = useState<D4HEquipmentItem[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [eqError, setEqError] = useState('');

  const callD4H = useCallback(async (action: string, extra: object = {}) => {
    const res = await fetch('/api/d4h', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: d4hToken, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'D4H error');
    return data;
  }, [d4hToken]);

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

  if (!configured) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow p-6 max-w-md text-center">
          <p className="text-gray-600 mb-3">D4H token not configured.</p>
          <a href="/settings" className="text-sm text-blue-600 hover:underline">Go to Settings →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Equipment</h1>
          <button onClick={loadEquipment} disabled={loadingEq}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50">
            {loadingEq ? 'Loading…' : '↺ Refresh'}
          </button>
        </div>

        <div className="flex gap-1 bg-white rounded-xl shadow p-1 mb-4">
          {([
            { id: 'quickcheck',  label: 'Quick Check' },
            { id: 'inspections', label: 'Inspections' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {eqError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{eqError}</div>
        )}

        {tab === 'quickcheck' && (
          <QuickCheckTab equipment={equipment} loading={loadingEq} callD4H={callD4H} />
        )}
        {tab === 'inspections' && (
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
      // Step 1: log usage record on the item
      await callD4H('logEquipmentUsage', { equipmentId: selected.id, notes: note });
      // Step 2: update item status/condition if not Good
      const isPoor = condition.startsWith('Poor');
      const isFair = condition.startsWith('Fair');
      await callD4H('updateEquipmentStatus', {
        equipmentId: selected.id,
        status: isPoor ? 'Unserviceable' : 'Operational',
        condition: isPoor ? 'Poor' : isFair ? 'Fair' : 'Good',
        customFields: { cf_inspection_result: isPoor || isFair ? 'Fail' : 'Pass', cf_last_inspected_date: new Date().toISOString().slice(0, 10) },
      });
      // Step 3: if Poor, auto-create a repair ticket
      if (isPoor) {
        await callD4H('createRepairTicket', {
          equipmentId: selected.id,
          title: `Failed Quick Check — ${selected.title}`,
          description: `Item flagged as unserviceable by ${inspector} during quick check.\n\n${note}`,
        });
      }
      setSubmitted(new Date().toLocaleTimeString('en-CA'));
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

      // Save locally first
      onResult(result);

      // Build D4H notes summary
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

      // Step 1: log usage record
      await callD4H('logEquipmentUsage', { equipmentId: selectedEq.id, notes });

      // Step 2: update item status
      await callD4H('updateEquipmentStatus', {
        equipmentId: selectedEq.id,
        status: overallPassed ? 'Operational' : 'Unserviceable',
        condition: overallPassed ? 'Good' : 'Poor',
        customFields: {
          cf_inspection_result: overallPassed ? 'Pass' : 'Fail',
          cf_last_inspected_date: new Date().toISOString().slice(0, 10),
        },
      });

      // Step 3: create repair ticket if failed
      if (!overallPassed) {
        const failedChecks = fieldResults
          .filter(f => f.value === false)
          .map(f => f.label)
          .join(', ');
        await callD4H('createRepairTicket', {
          equipmentId: selectedEq.id,
          title: `Failed Inspection — ${selectedEq.title}`,
          description: `Failed "${selectedTpl.name}" inspection by ${inspector.trim()}.\nFailed checks: ${failedChecks}\n\n${notes}`,
        });
      }

      setSaved(new Date().toLocaleTimeString('en-CA'));
      setFieldValues({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit to D4H');
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
              <div>
                <div className="font-semibold text-gray-800">{r.equipmentName}</div>
                <div className="text-xs text-gray-500">{r.templateName} · {r.completedBy} · {new Date(r.completedAt).toLocaleString('en-CA')}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${r.overallPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {r.overallPassed ? 'PASS' : 'FAIL'}
              </span>
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
