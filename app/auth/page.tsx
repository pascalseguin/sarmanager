'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [tokens, setTokens] = useState({
    caltopoTeamId: '',
    caltopoSecret: '',
    d4hToken: '',
  });
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(tokens);
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">SAR Manager Login</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">CalTopo Team ID</label>
          <input
            type="text"
            value={tokens.caltopoTeamId}
            onChange={(e) => setTokens({ ...tokens, caltopoTeamId: e.target.value })}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">CalTopo Secret</label>
          <input
            type="password"
            value={tokens.caltopoSecret}
            onChange={(e) => setTokens({ ...tokens, caltopoSecret: e.target.value })}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">D4H Token</label>
          <input
            type="password"
            value={tokens.d4hToken}
            onChange={(e) => setTokens({ ...tokens, d4hToken: e.target.value })}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Login
        </button>
      </form>
    </div>
  );
}