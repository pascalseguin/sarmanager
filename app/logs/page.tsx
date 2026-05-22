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
    setClearing(true);
    await fetch('/api/logs', { method: 'DELETE' });
    setClearing(false);
    load();
  }

  const filtered = data?.lines.filter(l =>
    !filter || l.toLowerCase().includes(filter.toLowerCase())
  ) ?? [];

  const errorCount = data?.lines.filter(l => l.includes('[ERROR]')).length ?? 0;

  function lineClass(line: string) {
    if (line.includes('[ERROR]')) return 'text-red-700 bg-red-50';
    if (line.includes('[INFO]'))  return 'text-gray-800';
    return 'text-gray-600';
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Server Log</h1>
          {data && (
            <p className="text-sm text-gray-600 mt-0.5">
              {data.path} &nbsp;·&nbsp; {data.total} total lines
              {errorCount > 0 && <span className="text-red-600 font-medium"> &nbsp;·&nbsp; {errorCount} errors</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter…"
            className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={load} disabled={loading}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={clearLog} disabled={clearing}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 transition-colors">
            {clearing ? 'Clearing…' : 'Clear Log'}
          </button>
        </div>
      </div>

      {data?.note && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mb-4">
          {data.note}
        </div>
      )}

      <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs overflow-auto max-h-[75vh]">
        {filtered.length === 0 && !loading && (
          <div className="text-gray-500 italic">No log entries{filter ? ' matching filter' : ''}.</div>
        )}
        {[...filtered].reverse().map((line, i) => (
          <div key={i} className={`py-0.5 whitespace-pre-wrap break-all ${lineClass(line)}`}>
            {line}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-2">Showing last {filtered.length} lines (newest first). Log auto-rotates at 5 MB.</p>
    </div>
  );
}
