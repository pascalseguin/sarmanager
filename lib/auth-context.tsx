'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { CalTopoAPI } from './api/caltopo';
import { D4HAPI } from './api/d4h';

interface AuthContextType {
  caltopoAPI: CalTopoAPI | null;
  d4hAPI: D4HAPI | null;
  isAuthenticated: boolean;
  login: (tokens: { caltopoTeamId: string; caltopoSecret: string; d4hToken: string }) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [caltopoAPI, setCaltopoAPI] = useState<CalTopoAPI | null>(null);
  const [d4hAPI, setD4hAPI] = useState<D4HAPI | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const login = (tokens: { caltopoTeamId: string; caltopoSecret: string; d4hToken: string }) => {
    setCaltopoAPI(new CalTopoAPI(tokens.caltopoTeamId, tokens.caltopoSecret));
    setD4hAPI(new D4HAPI(tokens.d4hToken));
    setIsAuthenticated(true);
  };

  return (
    <AuthContext.Provider value={{ caltopoAPI, d4hAPI, isAuthenticated, login }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}