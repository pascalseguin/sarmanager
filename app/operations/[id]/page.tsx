'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Operation } from '@/lib/operations-store';
import OperationRollout from '@/components/OperationRollout';
import { useAuth } from '@/lib/auth-context';

export default function OperationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, authFetch } = useAuth();
  const [op, setOp] = useState<Operation | null>(null);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    authFetch(`/api/operations/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.operation) setOp(data.operation);
        else { setFetchError('Operation not found'); router.replace('/operations'); }
      })
      .catch(() => { setFetchError('Failed to load operation'); router.replace('/operations'); });
  }, [user, id]);

  if (loading || !user) return null;
  if (fetchError) return <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--danger)' }}>{fetchError}</p></div>;
  if (!op) return <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;

  return (
    <div className="app-content panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13 }}>
        <button onClick={() => router.push('/operations')} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ← Operations
        </button>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</span>
      </div>
      <OperationRollout op={op} onUpdated={setOp} />
    </div>
  );
}
