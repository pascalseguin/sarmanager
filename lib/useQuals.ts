'use client';

import { useState, useEffect } from 'react';

interface QualsResult {
  all: string[];
  d4h: string[];
  extra: string[];
  loading: boolean;
}

// Simple module-level cache so all components share the same fetch
let cache: { all: string[]; d4h: string[]; extra: string[] } | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

async function fetchQuals() {
  const res = await fetch('/api/quals');
  if (!res.ok) return;
  cache = await res.json();
  notify();
}

export function useQuals(): QualsResult {
  const [, tick] = useState(0);

  useEffect(() => {
    const update = () => tick(n => n + 1);
    listeners.add(update);
    if (!cache && !pending) {
      pending = fetchQuals().finally(() => { pending = null; });
    }
    return () => { listeners.delete(update); };
  }, []);

  return {
    all: cache?.all ?? [],
    d4h: cache?.d4h ?? [],
    extra: cache?.extra ?? [],
    loading: !cache,
  };
}

export function invalidateQuals() {
  cache = null;
  fetchQuals();
}
