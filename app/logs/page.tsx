'use client';

import { useState, useEffect, useCallback } from 'react';

interface LogData {
  lines: string[];
  path: string;
  total: number;
  note?: string;
}

export default function LogsPage() {
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearLog() {
    if (!confirm('Clear all log entries?')) return;
    setClearing(true);
    await fetch('/api/logs', { method: 'DELETE' });
    setClearing(false);
    load();
  }

  const filtered = data?.lines.filter(l =>
    !filter || l.toLowerCase().includes(filter.toLowerCase())
  ) ?? [];

  const errorCount = data?.lines.filter(l => l.includes('[ERROR]')).length ?? 0;

  function lineColor(line: string) {
    if (line.includes('[ERROR]')) return 'var(--danger)';
    if (line.includes('[WARN]'))  return 'var(--warning)';
    if (line.includes('[INFO]'))  return 'var(--text)';
    return 'var(--text-muted)';
  }

  return (
    <div className="app-content panel">
      <div style={{ maxWidth: 960 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Server Log</h1>
            {data && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {data.path} &nbsp;·&nbsp; {data.total} total lines
                {errorCount > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> &nbsp;·&nbsp; {errorCount} errors</span>}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter…"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, outline: 'none', width: 160 }}
            />
            <button onClick={load} disabled={loading} className="btn btn-ghost btn-sm">
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
            <button onClick={clearLog} disabled={clearing} className="btn btn-danger btn-sm">
              {clearing ? 'Clearing…' : 'Clear Log'}
            </button>
          </div>
        </div>

        {data?.note && (
          <div className="card" style={{ marginBottom: 16, padding: '10px 14px', borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)', color: 'var(--accent)', fontSize: 13 }}>
            {data.note}
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#010409', padding: 16, fontFamily: 'monospace', fontSize: 12, overflowY: 'auto', maxHeight: '75vh', borderRadius: 'var(--radius)' }}>
            {filtered.length === 0 && !loading && (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No log entries{filter ? ' matching filter' : ''}.</div>
            )}
            {[...filtered].reverse().map((line, i) => (
              <div key={i} style={{ padding: '1px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: lineColor(line) }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Showing last {filtered.length} lines (newest first). Log auto-rotates at 5 MB.
        </p>
      </div>
    </div>
  );
}
