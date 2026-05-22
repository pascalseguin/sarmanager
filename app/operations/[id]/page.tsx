'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { operationsStore, Operation } from '@/lib/operations-store';
import OperationRollout from '@/components/OperationRollout';

export default function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [op, setOp] = useState<Operation | null>(null);

  useEffect(() => {
    const found = operationsStore.get(id);
    if (!found) router.replace('/operations');
    else setOp(found);
  }, [id]);

  if (!op) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/operations')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Operations
          </button>
          <span className="text-gray-500">/</span>
          <span className="text-sm font-medium text-gray-700 truncate">{op.name}</span>
        </div>
        <OperationRollout op={op} onUpdated={setOp} />
      </div>
    </div>
  );
}
