'use client';

/**
 * lib/auth-context.tsx — Client-side authentication state
 *
 * PURPOSE: Provides the authentication context for the React component tree.
 * All components that need to know "who is logged in?" or make authenticated
 * API calls use the useAuth() hook from this module.
 *
 * TOKEN STORAGE:
 *   Session tokens are stored in localStorage under SESSION_STORAGE_KEY.
 *
 *   Trade-off: localStorage is accessible to JavaScript running on the same
 *   origin, so it is theoretically vulnerable to XSS.  The safer alternative
 *   is httpOnly cookies, which are inaccessible to JS.
 *
 *   For THIS application the trade-off is acceptable because:
 *     1. This is a local desktop application — there is no cross-origin risk.
 *     2. Content-Security-Policy headers would need to be configured at the
 *        web-server level (outside this app) for httpOnly cookies to help.
 *     3. The Electron host process fully trusts the renderer context.
 *
 *   If this app is ever deployed as a public-facing web service, migrate to
 *   httpOnly cookies (see Next.js docs on cookie-based sessions).
 *
 * SECURITY REFERENCES:
 *   OWASP A07:2021 — Identification and Authentication Failures
 *   OWASP ASVS v4 §3.2 (Session Binding)
 *   OWASP ASVS v4 §3.4 (Cookie-based Session Management) — for future reference
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { SESSION_STORAGE_KEY } from './constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:             string;
  username:       string;
  role:           string;
  displayName?:   string;
  qualifications?: string;
  phone?:         string;
}

interface AuthContextType {
  /** The currently authenticated user, or null if not logged in. */
  user:      AuthUser | null;
  /** The raw Bearer token for use in Authorization headers, or null. */
  token:     string | null;
  /** True while the initial session-restore fetch is in flight. */
  loading:   boolean;
  /** Login with username + password.  Throws on failure. */
  login:     (username: string, password: string) => Promise<void>;
  /** Logout: invalidate server session and clear local state. */
  logout:    () => Promise<void>;
  /**
   * Convenience wrapper around fetch() that injects the Authorization header.
   * Use this for all authenticated API calls so the token is added consistently.
   */
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Fetch current user from API (session restore) ─────────────────────────
  async function fetchMe(tok: string): Promise<AuthUser | null> {
    try {
      const res = await fetch('/api/auth', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    } catch {
      // Network error or JSON parse failure — treat as unauthenticated
      return null;
    }
  }

  // ── Restore session from localStorage on first render ────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    fetchMe(stored).then(u => {
      if (u) {
        setToken(stored);
        setUser(u);
      } else {
        // Token is expired or invalid — discard it
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      setLoading(false);
    });
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  async function login(username: string, password: string): Promise<void> {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Login failed');

    // Persist token and update context state
    localStorage.setItem(SESSION_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);

    // SECURITY FIX: Do NOT include the token in the CustomEvent payload.
    // CustomEvent details are accessible to any JavaScript listening on window,
    // including third-party scripts.  Broadcasting the session token this way
    // would allow any injected script to impersonate the user
    // (OWASP A07:2021, OWASP ASVS v4 §3.2).
    //
    // If other parts of the application need to react to login, they should
    // subscribe to the AuthContext or listen for this event and re-read the
    // token from AuthContext — not from the event detail.
    window.dispatchEvent(new CustomEvent('sarmanager:login'));
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function logout(): Promise<void> {
    if (token) {
      // Ask the server to delete the session row so the token cannot be reused
      // (OWASP ASVS v4 §3.3 — Session Termination)
      await fetch('/api/auth', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // Non-fatal: if the server request fails, we still clear local state
      });
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  // ── Authenticated fetch helper ────────────────────────────────────────────
  /**
   * Drop-in replacement for fetch() that automatically adds the Authorization
   * header.  Prefer this over manual header construction in components.
   *
   * @example
   * const res = await authFetch('/api/operations', { method: 'POST', body: ... });
   */
  const authFetch = useCallback(
    (url: string, init: RequestInit = {}): Promise<Response> => {
      return fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [token],
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access the authentication context.
 * Must be called inside a component that is a descendant of AuthProvider.
 *
 * @throws If called outside of AuthProvider (programming error — not a runtime error).
 */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called inside an <AuthProvider> tree.');
  }
  return ctx;
}
