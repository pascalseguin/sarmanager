export interface ISRIDProfile {
  label: string;
  emoji: string;
  notes: string;
  distances: { pct: number; km: number }[];
}

export const ISRID: Record<string, ISRIDProfile> = {
  hiker:            { label: 'Hiker',               emoji: '🥾', notes: 'Stays on trail. Tends uphill. Responds to calls.', distances: [{ pct: 25, km: 1.5 }, { pct: 50, km: 3.2 }, { pct: 75, km: 6.5 }, { pct: 95, km: 13.3 }] },
  child_1_3:        { label: 'Child (1–3)',          emoji: '👶', notes: 'Travels very short distances. Seeks enclosed hiding spots.', distances: [{ pct: 25, km: 0.4 }, { pct: 50, km: 0.7 }, { pct: 75, km: 1.2 }, { pct: 95, km: 2.0 }] },
  child_4_6:        { label: 'Child (4–6)',          emoji: '🧒', notes: 'Hides when frightened. May not respond to strangers.', distances: [{ pct: 25, km: 0.5 }, { pct: 50, km: 0.9 }, { pct: 75, km: 1.5 }, { pct: 95, km: 2.4 }] },
  child_7_12:       { label: 'Child (7–12)',         emoji: '🧒', notes: 'Travels downhill or along water.', distances: [{ pct: 25, km: 0.8 }, { pct: 50, km: 1.4 }, { pct: 75, km: 2.7 }, { pct: 95, km: 5.6 }] },
  dementia:         { label: 'Dementia / Alzheimer', emoji: '🧠', notes: 'Goal-directed but confused. Often found in drainages or dense vegetation.', distances: [{ pct: 25, km: 0.7 }, { pct: 50, km: 1.4 }, { pct: 75, km: 2.6 }, { pct: 95, km: 5.1 }] },
  despondent:       { label: 'Despondent',           emoji: '⚠️', notes: 'Seeks isolation. Often found near water or elevated terrain.', distances: [{ pct: 25, km: 1.5 }, { pct: 50, km: 3.1 }, { pct: 75, km: 6.5 }, { pct: 95, km: 14.5 }] },
  mental_illness:   { label: 'Mental Illness',       emoji: '🩺', notes: 'Erratic travel. Avoids contact with responders.', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.1 }, { pct: 95, km: 10.4 }] },
  mentally_disabled:{ label: 'Mentally Disabled',    emoji: '🤝', notes: 'Short travel. Responds to familiar people. Check nearby structures.', distances: [{ pct: 25, km: 0.4 }, { pct: 50, km: 0.9 }, { pct: 75, km: 1.9 }, { pct: 95, km: 4.0 }] },
  substance:        { label: 'Substance Abuse',      emoji: '🍺', notes: 'Unpredictable. Check sheltered spots.', distances: [{ pct: 25, km: 1.2 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.0 }, { pct: 95, km: 9.9 }] },
  camper:           { label: 'Camper / Backpacker',  emoji: '⛺', notes: 'Near campsite or water. Likely has shelter and supplies.', distances: [{ pct: 25, km: 1.4 }, { pct: 50, km: 2.8 }, { pct: 75, km: 5.5 }, { pct: 95, km: 12.1 }] },
  hunter:           { label: 'Hunter',               emoji: '🦌', notes: 'Wide travel. May be sheltered and armed.', distances: [{ pct: 25, km: 2.0 }, { pct: 50, km: 4.0 }, { pct: 75, km: 7.5 }, { pct: 95, km: 18.0 }] },
  climber:          { label: 'Climber / Mountaineer',emoji: '🧗', notes: 'Found at or below objective. Check cliff bases.', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 1.8 }, { pct: 75, km: 3.7 }, { pct: 95, km: 7.2 }] },
  skier:            { label: 'Skier / Snowboarder',  emoji: '⛷️', notes: 'Follows fall line. Check avalanche terrain.', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.5 }, { pct: 95, km: 12.0 }] },
  mountain_biker:   { label: 'Mountain Biker',       emoji: '🚵', notes: 'May have traveled far. Bike may be found first.', distances: [{ pct: 25, km: 2.5 }, { pct: 50, km: 5.1 }, { pct: 75, km: 9.7 }, { pct: 95, km: 20.0 }] },
  horseback:        { label: 'Horseback Rider',      emoji: '🐴', notes: 'Check for riderless horse. Rider may be thrown.', distances: [{ pct: 25, km: 2.0 }, { pct: 50, km: 4.5 }, { pct: 75, km: 9.0 }, { pct: 95, km: 20.0 }] },
};

export const RING_COLORS: Record<number, string> = {
  25: '#ef4444',
  50: '#f59e0b',
  75: '#3b82f6',
  95: '#6b7280',
};

/** Returns the GeoJSON circle polygon approximation for a lat/lon + radius in km */
export function circlePolygon(lat: number, lon: number, radiusKm: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const R = 6371;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / R) * (180 / Math.PI) * Math.cos(angle);
    const dLon = (radiusKm / R) * (180 / Math.PI) * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
    coords.push([lon + dLon, lat + dLat]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}
