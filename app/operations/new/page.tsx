'use client';

import { useRouter } from 'next/navigation';
import OperationIntake from '@/components/OperationIntake';
import { Operation } from '@/lib/operations-store';

export default function NewOperationPage() {
  const router = useRouter();

  function handleCreated(op: Operation) {
    router.push(`/operations/${op.id}`);
  }

  return (
    <div className="app-content panel">
      <div style={{ maxWidth: 760 }}>
        <div className="page-header">
          <h1 className="page-title">New Operation</h1>
        </div>
        <div className="card">
          <OperationIntake
            onCreated={handleCreated}
            onCancel={() => router.push('/operations')}
          />
        </div>
      </div>
    </div>
  );
}
