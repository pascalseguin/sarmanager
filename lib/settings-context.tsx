'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CalTopoSettings {
  credentialId: string;
  secret: string;
  accountId: string;
  folderId: string;
  ippFolderId: string;
  ringFolderId: string;
  defaultGeoJSON: GeoJSON.FeatureCollection | null;
  defaultGeoJSONName: string;
  d4hToken: string;
  d4hTeamId: string;
  d4hTeamName: string;
  hereApiKey: string;
  geocodeCountry: string;  // ISO 3166-1 alpha-2 (e.g. 'ca', 'us')
  geocodeRegion: string;   // Province / state full name (e.g. 'Alberta')
  opNameTemplate: string;
  // Organization identity
  orgName: string;
  orgFullName: string;
  // Operational presets
  taskingAgencies: string[];
  lpbRingPcts: number[];
  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  // Radio check aging thresholds (minutes)
  radioCheckYellowMins: number;
  radioCheckRedMins: number;
  // IMT Checklists (null = use built-in defaults)
  imtChecklists: { title: string; color: string; tasks: string[] }[] | null;
}

interface SettingsContextType {
  settings: CalTopoSettings;
  updateSettings: (partial: Partial<CalTopoSettings>) => void;
  isConfigured: boolean;
}

// Legacy localStorage key — used only for one-time migration
const LEGACY_KEY  = 'sarmanager_caltopo_settings';
const SESSION_KEY = 'sarmanager_session_token';

const defaultSettings: CalTopoSettings = {
  credentialId: '',
  secret: '',
  accountId: '',
  folderId: '',
  ippFolderId: '',
  ringFolderId: '',
  defaultGeoJSON: null,
  defaultGeoJSONName: '',
  d4hToken: '',
  d4hTeamId: '',
  d4hTeamName: '',
  hereApiKey: '',
  geocodeCountry: '',
  geocodeRegion: '',
  opNameTemplate: '{location}-{date}-{d4h_id}',
  orgName: 'SEASAR',
  orgFullName: 'South Eastern Alberta Search & Rescue',
  taskingAgencies: ['RCMP', 'MHPS', 'AHS', 'STARS', 'CJFR', 'Other'],
  lpbRingPcts: [50, 75, 95],
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  radioCheckYellowMins: 45,
  radioCheckRedMins: 60,
  imtChecklists: null,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

async function saveToServer(settings: CalTopoSettings, token: string) {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ settings }),
  });
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CalTopoSettings>(defaultSettings);

  function loadFromServer(token: string) {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings && Object.keys(data.settings).length > 0) {
          setSettings({ ...defaultSettings, ...data.settings });
        } else {
          // No server settings yet — migrate from localStorage if present
          const legacy = localStorage.getItem(LEGACY_KEY);
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy);
              const merged = { ...defaultSettings, ...parsed };
              setSettings(merged);
              saveToServer(merged, token).catch(() => {});
              localStorage.removeItem(LEGACY_KEY);
            } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) loadFromServer(token);

    function onLogin(e: Event) {
      const tok = (e as CustomEvent).detail?.token ?? localStorage.getItem(SESSION_KEY);
      if (tok) loadFromServer(tok);
    }
    window.addEventListener('sarmanager:login', onLogin);
    return () => window.removeEventListener('sarmanager:login', onLogin);
  }, []);

  const updateSettings = (partial: Partial<CalTopoSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      const token = localStorage.getItem(SESSION_KEY);
      if (token) saveToServer(next, token).catch(() => {});
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
