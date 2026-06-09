'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import NewMapButton from '@/components/NewMapButton';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-800">SAR Manager</h1>
          <p className="text-gray-500 mt-2">SEASAR — South Eastern Alberta Search &amp; Rescue</p>
          <p className="text-xs text-gray-400 mt-1">Signed in as {user.displayName ?? user.username} ({user.role.toUpperCase()})</p>
        </div>

        <div className="space-y-3">
          <Link href="/operations"
            className="block w-full bg-blue-600 text-white py-4 px-6 rounded-xl text-lg font-semibold hover:bg-blue-700 transition-colors shadow">
            Operations
          </Link>
          <Link href="/operations/new"
            className="block w-full bg-green-600 text-white py-4 px-6 rounded-xl text-lg font-semibold hover:bg-green-700 transition-colors shadow">
            + New Operation
          </Link>
          <Link href="/personnel"
            className="block w-full bg-gray-600 text-white py-4 px-6 rounded-xl text-lg font-semibold hover:bg-gray-700 transition-colors shadow">
            Personnel Roster
          </Link>
          <div className="pt-2">
            <NewMapButton />
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-8">
          <Link href="/settings" className="hover:underline">Settings</Link>
        </p>
      </div>
    </div>
  );
}
