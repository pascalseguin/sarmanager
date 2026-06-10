'use client';

import { useEffect, useRef } from 'react';

interface Feature {
  id?: string;
  type: string;
  geometry: { type: string; coordinates: number[] | number[][] | number[][][] };
  properties: Record<string, unknown>;
}

interface Props {
  features: Feature[];
}

// ESRI ICS — Incident Command Post icon (matches Electron app)
const ICP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <polygon points="2,2 30,2 2,30" fill="white"/>
  <polygon points="30,2 30,30 2,30" fill="#0055A5"/>
  <rect x="1" y="1" width="30" height="30" fill="none" stroke="black" stroke-width="1.5"/>
  <line x1="2" y1="30" x2="30" y2="2" stroke="black" stroke-width="1.5"/>
</svg>`;

export default function CalTopoMap({ features }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Leaflet must be imported client-side only
    import('leaflet').then(L => {
      // Avoid double-init on React strict-mode remount
      if (mapRef.current) {
        (mapRef.current as ReturnType<typeof L.map>).remove();
        mapRef.current = null;
      }

      const el = containerRef.current!;

      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Imagery © Esri', maxZoom: 18 }
      );
      const topo = L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenTopoMap (CC-BY-SA)', maxZoom: 17 }
      );
      const trails = L.tileLayer(
        'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
        { attribution: '© Waymarked Trails', maxZoom: 18, opacity: 0.75 }
      );
      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Labels © Esri', maxZoom: 18 }
      );

      const map = L.map(el, { layers: [satellite, trails, labels] });
      mapRef.current = map;

      L.control.layers(
        { Satellite: satellite, Topo: topo },
        { Trails: trails, Labels: labels },
        { position: 'topright', collapsed: false }
      ).addTo(map);

      const icpIcon = L.divIcon({
        html: ICP_SVG,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        tooltipAnchor: [0, -18],
      });

      const allLatLngs: ReturnType<typeof L.latLng>[] = [];

      for (const f of features) {
        const cls = (f.properties?.class as string) ?? '';
        const title = (f.properties?.title as string) ?? '';
        const color = (f.properties?.['marker-color'] as string) ?? (f.properties?.stroke as string) ?? '#ef4444';

        if (f.geometry?.type === 'Point') {
          const [lng, lat] = f.geometry.coordinates as number[];
          const isIPP = title.toUpperCase().includes('IPP');
          let layer: ReturnType<typeof L.marker> | ReturnType<typeof L.circleMarker>;
          if (isIPP || cls === 'Marker') {
            layer = isIPP
              ? L.marker([lat, lng], { icon: icpIcon })
              : L.circleMarker([lat, lng], { radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.8 });
            layer.bindTooltip(title, { permanent: isIPP, direction: 'top', offset: [0, -20] });
          } else {
            layer = L.circleMarker([lat, lng], { radius: 7, color, weight: 2, fillColor: color, fillOpacity: 0.8 });
            if (title) layer.bindTooltip(title, { direction: 'top' });
          }
          layer.addTo(map);
          allLatLngs.push(L.latLng(lat, lng));
        } else if (f.geometry?.type === 'Polygon') {
          const rings = f.geometry.coordinates as number[][][];
          const latLngs = rings[0].map(([lng, lat]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color,
            weight: Number(f.properties?.['stroke-width'] ?? 2),
            fillColor: color,
            fillOpacity: Number(f.properties?.['fill-opacity'] ?? 0.05),
          }).addTo(map);
          if (title) poly.bindTooltip(title);
          allLatLngs.push(...latLngs);
        } else if (f.geometry?.type === 'LineString') {
          const coords = f.geometry.coordinates as number[][];
          const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
          L.polyline(latLngs, { color, weight: 2 }).addTo(map);
          allLatLngs.push(...latLngs);
        }
      }

      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [32, 32], maxZoom: 14 });
      } else {
        // Default to Alberta if no features
        map.setView([50.5, -111.5], 8);
      }
    });

    return () => {
      if (mapRef.current) {
        import('leaflet').then(L => {
          (mapRef.current as ReturnType<typeof L.map>).remove();
          mapRef.current = null;
        });
      }
    };
  }, [features]);

  return (
    <>
      {/* Leaflet CSS — must be loaded globally; inline import as fallback */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
    </>
  );
}
