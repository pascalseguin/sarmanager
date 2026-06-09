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
  if (fetchError) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-red-500">{fetchError}</p></div>;
  if (!op) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/operations')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Operations
          </button>
          <span className="text-gray-400">/</span>
          <span className="text-sm font-medium text-gray-700 truncate">{op.name}</span>
        </div>
        <OperationRollout op={op} onUpdated={setOp} />
      </div>
    </div>
  );
}
