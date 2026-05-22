'use client';

import { useState } from 'react';
import { useSettings } from '@/lib/settings-context';

type Status = 'idle' | 'creating' | 'seeding' | 'done' | 'error';

export default function NewMapButton() {
  const { settings, isConfigured } = useSettings();
  const [showModal, setShowModal] = useState(false);
  const [mapTitle, setMapTitle] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setStatus('idle');
    setProgress('');
    setResultUrl('');
    setError('');
    setMapTitle('');
  };

  const handleCreate = async () => {
    if (!mapTitle.trim()) return;
    setStatus('creating');
    setError('');

    try {
      // 1. Create the map
      const createRes = await fetch('/api/caltopo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMap',
          credentialId: settings.credentialId,
          secret: settings.secret,
          accountId: settings.accountId,
          title: mapTitle.trim(),
          folderId: settings.folderId || undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.mapId) {
        throw new Error(createData.error ?? 'Failed to create map');
      }

      const { mapId, url } = createData;

      // 2. Seed default GeoJSON features
      if (settings.defaultGeoJSON?.features?.length) {
        const features = settings.defaultGeoJSON.features;
        setStatus('seeding');

        for (let i = 0; i < features.length; i++) {
          const feature = features[i];
          const geomType = feature.geometry?.type ?? 'unknown';
          if (!['Point', 'LineString', 'Polygon'].includes(geomType)) continue;

          setProgress(`Adding feature ${i + 1} of ${features.length}…`);

          const addRes = await fetch('/api/caltopo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'addFeature',
              credentialId: settings.credentialId,
              secret: settings.secret,
              accountId: settings.accountId,
              mapId,
              feature,
            }),
          });

          if (!addRes.ok) {
            const addData = await addRes.json();
            console.warn(`Feature ${i + 1} failed:`, addData.error);
          }
        }
      }

      setResultUrl(url);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  if (!isConfigured) {
    return (
      <a href="/settings" className="inline-block bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors text-sm">
        Configure CalTopo to enable New Map
      </a>
    );
  }

  return (
    <>
      <button
        onClick={() => { reset(); setShowModal(true); }}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors text-sm font-medium"
      >
        + New CalTopo Map
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Create New CalTopo Map</h2>

            {status === 'idle' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Map Name</label>
                <input
                  type="text"
                  value={mapTitle}
                  onChange={(e) => setMapTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Search Op – May 15 2026"
                  autoFocus
                  className="w-full p-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {settings.defaultGeoJSONName && (
                  <p className="text-xs text-gray-500 mb-4">
                    Will seed <strong>{settings.defaultGeoJSON?.features?.length}</strong> features from <em>{settings.defaultGeoJSONName}</em>
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!mapTitle.trim()}
                    className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Create Map
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {(status === 'creating' || status === 'seeding') && (
              <div className="text-center py-4">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-gray-700">
                  {status === 'creating' ? 'Creating map…' : progress || 'Adding features…'}
                </p>
              </div>
            )}

            {status === 'done' && (
              <div className="text-center py-2">
                <p className="text-green-700 font-medium mb-3">Map created!</p>
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors mb-2"
                >
                  Open in CalTopo
                </a>
                <p className="text-xs text-gray-500 break-all mb-3">{resultUrl}</p>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center py-2">
                <p className="text-red-600 mb-3">{error}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatus('idle')}
                    className="flex-1 border border-gray-300 rounded py-2 hover:bg-gray-50 transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 border border-gray-300 rounded py-2 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
