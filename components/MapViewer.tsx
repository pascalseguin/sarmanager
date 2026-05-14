'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapViewer() {
  useEffect(() => {
    const map = L.map('map').setView([51.505, -0.09], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add sample markers
    L.marker([51.5, -0.09]).addTo(map)
      .bindPopup('Search Zone 1');

    return () => {
      map.remove();
    };
  }, []);

  return <div id="map" className="h-64 w-full"></div>;
}