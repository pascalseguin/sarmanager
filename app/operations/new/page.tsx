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
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">New Operation</h1>
        <div className="bg-white rounded-xl shadow p-6">
          <OperationIntake
            onCreated={handleCreated}
            onCancel={() => router.push('/operations')}
          />
        </div>
      </div>
    </div>
  );
}
