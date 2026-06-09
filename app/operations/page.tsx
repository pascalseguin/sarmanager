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

const PRIORITY_LABEL: Record<number, string> = { 1: 'P1 – Critical', 2: 'P2 – High', 3: 'P3 – Normal' };
const PRIORITY_COLOR: Record<number, string> = { 1: 'bg-red-100 text-red-700', 2: 'bg-yellow-100 text-yellow-700', 3: 'bg-gray-100 text-gray-600' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-green-100 text-green-700', standby: 'bg-yellow-100 text-yellow-700', closed: 'bg-gray-100 text-gray-500' };

function elapsed(startedAt: string) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  const closed = ops.filter(o => o.status === 'closed');

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Operations</h1>
          <Link href="/operations/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            + New Operation
          </Link>
        </div>

        {!fetching && ops.length === 0 && (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <p className="text-gray-500 mb-4">No operations yet.</p>
            <Link href="/operations/new"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Start First Operation
            </Link>
          </div>
        )}

        {active.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Active</h2>
            <div className="space-y-3">
              {active.map(op => <OpCard key={op.id} op={op} />)}
            </div>
          </div>
        )}

        {closed.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Closed</h2>
            <div className="space-y-3">
              {closed.map(op => <OpCard key={op.id} op={op} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OpCard({ op }: { op: Operation }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 hover:shadow-md transition-shadow relative group">
      <Link href={`/operations/${op.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800 truncate">{op.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {op.tasking_agency && <span>{op.tasking_agency} · </span>}
              {op.lost_person_name && <span>{op.lost_person_name}{op.lost_person_age ? `, ${op.lost_person_age}y` : ''} · </span>}
              {op.status === 'active' && <span className="text-blue-600">{elapsed(op.started_at)} elapsed</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${PRIORITY_COLOR[op.priority] ?? 'bg-gray-100 text-gray-600'}`}>
              {PRIORITY_LABEL[op.priority] ?? `P${op.priority}`}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_COLOR[op.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {op.status}
            </span>
            {op.deploy_decision === 'yes' && (
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">Deployed</span>
            )}
          </div>
        </div>
      </Link>
      {op.status === 'active' && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
          <Link href={`/operations/${op.id}/close`}
            className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            onClick={e => e.stopPropagation()}>
            Close Operation →
          </Link>
        </div>
      )}
    </div>
  );
}
