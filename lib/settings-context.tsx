'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CalTopoSettings {
  credentialId: string;
  secret: string;
  accountId: string;
  folderId: string;
  defaultGeoJSON: GeoJSON.FeatureCollection | null;
  defaultGeoJSONName: string;
  d4hToken: string;
  d4hTeamId: string;
  d4hTeamName: string;
  hereApiKey: string;
}

interface SettingsContextType {
  settings: CalTopoSettings;
  updateSettings: (partial: Partial<CalTopoSettings>) => void;
  isConfigured: boolean;
}

const STORAGE_KEY = 'sarmanager_caltopo_settings';

const defaultSettings: CalTopoSettings = {
  credentialId: '',
  secret: '',
  accountId: '',
  folderId: '',
  defaultGeoJSON: null,
  defaultGeoJSONName: '',
  d4hToken: '',
  d4hTeamId: '',
  d4hTeamName: '',
  hereApiKey: '',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CalTopoSettings>(defaultSettings);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const updateSettings = (partial: Partial<CalTopoSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const isConfigured = Boolean(settings.credentialId && settings.secret && settings.accountId);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isConfigured }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
