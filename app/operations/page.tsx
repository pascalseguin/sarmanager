'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface Operation {
  id: string;
  name: string;
  status: string;
  priority: number;
  started_at: string;
  tasking_agency?: string;
  lost_person_name?: string;
  lost_person_age?: number;
  deploy_decision?: string;
}

function elapsed(startedAt: string) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function PriorityBadge({ p }: { p: number }) {
  return <span className={`priority priority-${p}`}>{p}</span>;
}

function StatusBadge({ s }: { s: string }) {
  return <span className={`badge badge-${s}`}>{s}</span>;
}

export default function OperationsPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    authFetch('/api/operations')
      .then(r => r.json())
      .then(d => setOps(d.operations ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  if (loading || !user) return null;

  const active = ops.filter(o => o.status === 'active');
  const standby = ops.filter(o => o.status === 'standby');
  const closed = ops.filter(o => o.status === 'closed');

  return (
    <div className="app-content panel">
      <div className="page-header">
        <h1 className="page-title">Operations</h1>
        <Link href="/operations/new" className="btn btn-primary">+ New Operation</Link>
      </div>

      {fetching && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      )}

      {!fetching && ops.length === 0 && (
        <div className="card empty-state" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <h3>No operations</h3>
          <p>Start by creating your first SAR operation.</p>
          <Link href="/operations/new" className="btn btn-primary">Start First Operation</Link>
        </div>
      )}

      {active.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">Active ({active.length})</div>
          <OpTable ops={active} />
        </div>
      )}

      {standby.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">Standby ({standby.length})</div>
          <OpTable ops={standby} />
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <div className="section-label">Closed ({closed.length})</div>
          <OpTable ops={closed} />
        </div>
      )}
    </div>
  );
}

function OpTable({ ops }: { ops: Operation[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="sar-table">
        <thead>
          <tr>
            <th>Operation</th>
            <th>Subject</th>
            <th>Agency</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Elapsed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ops.map(op => (
            <tr key={op.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/operations/${op.id}`}>
              <td style={{ fontWeight: 600 }}>{op.name}</td>
              <td style={{ color: 'var(--text-muted)' }}>
                {op.lost_person_name
                  ? `${op.lost_person_name}${op.lost_person_age ? `, ${op.lost_person_age}y` : ''}`
                  : <span style={{ opacity: 0.4 }}>—</span>}
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{op.tasking_agency ?? <span style={{ opacity: 0.4 }}>—</span>}</td>
              <td><PriorityBadge p={op.priority} /></td>
              <td>
                <StatusBadge s={op.status} />
                {op.deploy_decision === 'yes' && <span className="badge badge-deployed" style={{ marginLeft: 4 }}>Deployed</span>}
              </td>
              <td style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {op.status === 'active' ? elapsed(op.started_at) : '—'}
              </td>
              <td>
                <Link href={`/operations/${op.id}`}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
