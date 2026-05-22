'use client';

import { useState, useRef } from 'react';
import { useSettings } from '@/lib/settings-context';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [form, setForm] = useState({
    credentialId: settings.credentialId,
    secret: settings.secret,
    accountId: settings.accountId,
    folderId: settings.folderId,
    d4hToken: settings.d4hToken,
  });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleGeoJSONFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.type !== 'FeatureCollection') {
          alert('File must be a GeoJSON FeatureCollection');
          return;
        }
        updateSettings({ defaultGeoJSON: parsed, defaultGeoJSONName: file.name });
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const field = (label: string, key: keyof typeof form, type = 'text', hint?: string) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

        <form onSubmit={handleSave} className="bg-white p-6 rounded shadow space-y-2">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">D4H</h2>
          {field('API Token', 'd4hToken', 'password', 'Found in D4H Team Manager → Account → API. Used for incidents, whiteboard, and callouts.')}

          <hr className="my-4 border-gray-200" />
          <h2 className="text-lg font-semibold text-gray-700 mb-4">CalTopo Service Account</h2>

          {field('Credential ID', 'credentialId')}
          {field('Secret', 'secret', 'password')}
          {field('Account ID', 'accountId')}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Folder ID
            </label>
            <input
              type="text"
              value={form.folderId}
              onChange={(e) => setForm({ ...form, folderId: e.target.value })}
              placeholder="e.g. abc123"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Open the SEASAR Operations folder on CalTopo and copy the ID from the URL
              (e.g. caltopo.com/f/<strong>abc123</strong>)
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
          >
            {saved ? 'Saved!' : 'Save Credentials'}
          </button>
        </form>

        <div className="bg-white p-6 rounded shadow mt-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Default Map Template</h2>
          <p className="text-sm text-gray-600 mb-3">
            Upload a GeoJSON file with the default features (boundaries, waypoints, sectors, etc.)
            that will be added to every new CalTopo map.
          </p>

          {settings.defaultGeoJSONName && (
            <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              <span>Current template: <strong>{settings.defaultGeoJSONName}</strong></span>
              <span className="text-gray-500">
                ({settings.defaultGeoJSON?.features?.length ?? 0} features)
              </span>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".geojson,.json"
            onChange={handleGeoJSONFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded py-3 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            {settings.defaultGeoJSONName ? 'Replace GeoJSON file' : 'Choose GeoJSON file'}
          </button>
        </div>
      </div>
    </div>
  );
}
