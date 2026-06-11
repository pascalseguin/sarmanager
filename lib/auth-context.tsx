'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  displayName?: string;
  qualifications?: string;
  phone?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const TOKEN_KEY = 'sarmanager_session_token';
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe(tok: string): Promise<AuthUser | null> {
    try {
      const res = await fetch('/api/auth', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    } catch { return null; }
  }

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setLoading(false); return; }
    fetchMe(stored).then(u => {
      if (u) { setToken(stored); setUser(u); }
      else localStorage.removeItem(TOKEN_KEY);
      setLoading(false);
    });
  }, []);

  async function login(username: string, password: string) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    window.dispatchEvent(new CustomEvent('sarmanager:login', { detail: { token: data.token } }));
  }

  async function logout() {
    if (token) {
      await fetch('/api/auth', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  const authFetch = useCallback((url: string, init: RequestInit = {}): Promise<Response> => {
    return fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
