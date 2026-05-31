export interface ISRIDProfile {
  label: string;
  emoji: string;
  notes: string;
  distances: { pct: number; km: number }[];
}

const DBS_NOTE = 'For detailed interview questions, consult the Lost Person Behaviour app.';

export const ISRID: Record<string, ISRIDProfile> = {
  hiker:             { label: 'Hiker',                  emoji: '🥾', distances: [{ pct: 25, km: 1.5 }, { pct: 50, km: 3.2 }, { pct: 75, km: 6.5 }, { pct: 95, km: 13.3 }], notes: `Stays on trail. Tends uphill. Responds to calls. ${DBS_NOTE}` },
  child_1_3:         { label: 'Child (1–3)',             emoji: '👶', distances: [{ pct: 25, km: 0.4 }, { pct: 50, km: 0.7 }, { pct: 75, km: 1.2 }, { pct: 95, km: 2.0  }], notes: `Travels very short distances. Seeks enclosed hiding spots. May not respond to calls. ${DBS_NOTE}` },
  child_4_6:         { label: 'Child (4–6)',             emoji: '🧒', distances: [{ pct: 25, km: 0.5 }, { pct: 50, km: 0.9 }, { pct: 75, km: 1.5 }, { pct: 95, km: 2.4  }], notes: `Hides when frightened. May not respond to strangers. ${DBS_NOTE}` },
  child_7_12:        { label: 'Child (7–12)',            emoji: '🧒', distances: [{ pct: 25, km: 0.8 }, { pct: 50, km: 1.4 }, { pct: 75, km: 2.7 }, { pct: 95, km: 5.6  }], notes: `Travels downhill or along water. May travel with peers. ${DBS_NOTE}` },
  dementia:          { label: 'Dementia / Alzheimer',    emoji: '🧠', distances: [{ pct: 25, km: 0.7 }, { pct: 50, km: 1.4 }, { pct: 75, km: 2.6 }, { pct: 95, km: 5.1  }], notes: `Goal-directed but confused. Often found in drainages or dense vegetation. May seek familiar destination. ${DBS_NOTE}` },
  despondent:        { label: 'Despondent',              emoji: '⚠️', distances: [{ pct: 25, km: 1.5 }, { pct: 50, km: 3.1 }, { pct: 75, km: 6.5 }, { pct: 95, km: 14.5 }], notes: `Seeks isolation. May have a vehicle. Often found near water or elevated terrain. ${DBS_NOTE}` },
  mental_illness:    { label: 'Mental Illness',          emoji: '🩺', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.1 }, { pct: 95, km: 10.4 }], notes: `Erratic travel pattern. May use transit. Avoids contact with responders. ${DBS_NOTE}` },
  mentally_disabled: { label: 'Mentally Disabled',       emoji: '🤝', distances: [{ pct: 25, km: 0.4 }, { pct: 50, km: 0.9 }, { pct: 75, km: 1.9 }, { pct: 95, km: 4.0  }], notes: `Short travel distance. May respond to familiar people. Check nearby structures. ${DBS_NOTE}` },
  substance:         { label: 'Substance Abuse',         emoji: '🍺', distances: [{ pct: 25, km: 1.2 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.0 }, { pct: 95, km: 9.9  }], notes: `Unpredictable direction. May be combative. Check sheltered spots and vegetation. ${DBS_NOTE}` },
  camper:            { label: 'Camper / Backpacker',     emoji: '⛺', distances: [{ pct: 25, km: 1.4 }, { pct: 50, km: 2.8 }, { pct: 75, km: 5.5 }, { pct: 95, km: 12.1 }], notes: `Near campsite or water source. Likely has shelter and supplies. ${DBS_NOTE}` },
  hunter:            { label: 'Hunter',                  emoji: '🦌', distances: [{ pct: 25, km: 2.0 }, { pct: 50, km: 4.0 }, { pct: 75, km: 7.5 }, { pct: 95, km: 18.0 }], notes: `Wide travel range. May be sheltered and armed. Check off-trail game areas. ${DBS_NOTE}` },
  climber:           { label: 'Climber / Mountaineer',   emoji: '🧗', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 1.8 }, { pct: 75, km: 3.7 }, { pct: 95, km: 7.2  }], notes: `Found at or below climbing objective. Prioritize cliff bases and couloirs. ${DBS_NOTE}` },
  skier:             { label: 'Skier / Snowboarder',     emoji: '⛷️', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 2.0 }, { pct: 75, km: 4.5 }, { pct: 95, km: 12.0 }], notes: `Follows fall line. Check avalanche terrain, tree wells, and cliff runouts. ${DBS_NOTE}` },
  mountain_biker:    { label: 'Mountain Biker',          emoji: '🚵', distances: [{ pct: 25, km: 2.7 }, { pct: 50, km: 6.4 }, { pct: 75, km: 13.2 }, { pct: 95, km: 29.1 }], notes: `May have traveled far. Found on or near trail. Bike may be found before subject. ${DBS_NOTE}` },
  horseback:         { label: 'Horseback Rider',         emoji: '🐴', distances: [{ pct: 25, km: 2.0 }, { pct: 50, km: 4.5 }, { pct: 75, km: 9.0 }, { pct: 95, km: 20.0 }], notes: `Horse may be found before rider. Check for riderless horse. Rider may be thrown. ${DBS_NOTE}` },

  // ── New categories from DBS-SAR Lost Person Behaviour data ──────────────────
  abduction:         { label: 'Abduction',               emoji: '🚨', distances: [{ pct: 25, km: 0.6 }, { pct: 50, km: 16.1 }, { pct: 75, km: 51.5 }],                                                                                              notes: `Treat as criminal investigation. Secure scene. Wide search radius required — subject may have been transported by vehicle. ${DBS_NOTE}` },
  aircraft_mountain: { label: 'Aircraft — Mountain',     emoji: '✈️', distances: [{ pct: 25, km: 0.6 }, { pct: 50, km: 1.5  }, { pct: 75, km: 7.2  }, { pct: 95, km: 65.2 }],                                                                      notes: `Search along flight path. Terrain and wreckage scatter wide in mountain environment. ELT signal if equipped. ${DBS_NOTE}` },
  aircraft_flat:     { label: 'Aircraft — Flat Terrain', emoji: '🛩️', distances: [{ pct: 25, km: 0.6 }, { pct: 50, km: 4.5  }, { pct: 75, km: 11.1 }, { pct: 95, km: 83.5 }],                                                                      notes: `Search along last known flight path. Debris field may be extensive in flat terrain. Coordinate with CASARA and TC. ${DBS_NOTE}` },
  boat_non_powered:  { label: 'Non-Powered Boat',        emoji: '🚣', distances: [{ pct: 25, km: 0.4 }, { pct: 50, km: 2.0  }, { pct: 75, km: 7.4  }, { pct: 95, km: 15.6 }],                                                                      notes: `Search downstream and downwind. Check shoreline and eddies. Capsized hull may be visible. ${DBS_NOTE}` },
  water_current:     { label: 'Person in Current Water', emoji: '🌊', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 6.4  }],                                                                                                                      notes: `Search downstream. Subject travels rapidly with current. Check strainers, logjams, and bends. Survival time in cold water is short. ${DBS_NOTE}` },
  water_flat:        { label: 'Person in Flat Water',    emoji: '💧', distances: [{ pct: 25, km: 1.0 }, { pct: 50, km: 6.4  }],                                                                                                                      notes: `Search from shore outward. Check vegetation and submerged obstacles near entry point. ${DBS_NOTE}` },
  water_flood:       { label: 'Person in Flood Water',   emoji: '🌧️', distances: [{ pct: 25, km: 3.0 }, { pct: 50, km: 19.0 }, { pct: 75, km: 28.0 }, { pct: 95, km: 62.0 }],                                                                      notes: `Extreme travel distance possible. Search well downstream. Check high-water mark debris. Hazmat and structural hazards likely. ${DBS_NOTE}` },
  boat_powered:      { label: 'Powered Boat',            emoji: '🛥️', distances: [{ pct: 25, km: 0.2 }, { pct: 50, km: 1.5  }, { pct: 75, km: 5.0  }, { pct: 95, km: 10.7 }],                                                                      notes: `Check near last known position. Mechanical failure common cause. Search shoreline and nearby islands. ${DBS_NOTE}` },
  motorcycle:          { label: 'Motorcycle',                        emoji: '🏍️', distances: [{ pct: 25, km: 6.5  }, { pct: 50, km: 11.7 }, { pct: 75, km: 17.5 }, { pct: 95, km: 24.3  }], notes: `High travel speed — search along road and trail networks well beyond LKP. Check ditches, embankments, and dense roadside vegetation. ${DBS_NOTE}` },
  vehicle_4wd:         { label: '4WD / Off-Road Vehicle',           emoji: '🚙', distances: [{ pct: 25, km: 0.1  }, { pct: 50, km: 5.3  }, { pct: 75, km: 10.4 }, { pct: 95, km: 18.8  }], notes: `Search off-road tracks, trails, and terrain near LKP. Vehicle may be stuck or concealed in bush. ${DBS_NOTE}` },
  vehicle_road:        { label: 'Vehicle — Road',                   emoji: '🚗', distances: [{ pct: 25, km: 2.0  }, { pct: 50, km: 5.0  }, { pct: 75, km: 12.6 }, { pct: 95, km: 62.7  }], notes: `Search along road network. Subject may have left road — check ditches, embankments, and rural pull-offs. ${DBS_NOTE}` },

  // ── Autism ──────────────────────────────────────────────────────────────────
  autism_temperate:    { label: 'Autism — Temperate',               emoji: '🧩', distances: [{ pct: 25, km: 0.6  }, { pct: 50, km: 1.6  }, { pct: 75, km: 3.7  }, { pct: 95, km: 15.2  }], notes: `Drawn to water, open spaces, or special interest areas. May not respond to name. Avoid direct eye contact when approaching. ${DBS_NOTE}` },
  autism_urban:        { label: 'Autism — Urban',                   emoji: '🧩', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 1.0  }, { pct: 75, km: 3.8  }, { pct: 95, km: 8.0   }], notes: `Check transit stops, familiar routes, libraries, and areas of special interest. May blend into crowd. ${DBS_NOTE}` },

  // ── Dementia variants ────────────────────────────────────────────────────────
  dementia_urban:      { label: 'Dementia — Urban',                 emoji: '🧠', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 1.1  }, { pct: 75, km: 3.2  }, { pct: 95, km: 12.6  }], notes: `Goal-directed but confused. Check transit, familiar businesses, former residences. May enter vehicles or buildings. ${DBS_NOTE}` },
  dementia_flat_dry:   { label: 'Dementia — Flat / Dry',            emoji: '🧠', distances: [{ pct: 25, km: 0.5  }, { pct: 50, km: 1.6  }, { pct: 75, km: 3.6  }, { pct: 95, km: 11.8  }], notes: `Goal-directed but confused. Check drainages and shelter. Often found in dense vegetation. ${DBS_NOTE}` },
  dementia_flat_temp:  { label: 'Dementia — Flat / Temperate',      emoji: '🧠', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 1.0  }, { pct: 75, km: 2.4  }, { pct: 95, km: 12.8  }], notes: `Goal-directed but confused. Often found near water or familiar destinations in temperate flat terrain. ${DBS_NOTE}` },
  dementia_mtn_temp:   { label: 'Dementia — Mountain / Temperate',  emoji: '🧠', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 0.8  }, { pct: 75, km: 1.9  }, { pct: 95, km: 8.3   }], notes: `Shorter travel in rugged terrain. Check drainages, trails, and dense cover near LKP. ${DBS_NOTE}` },
  dementia_mtn_dry:    { label: 'Dementia — Mountain / Dry',        emoji: '🧠', distances: [{ pct: 25, km: 1.0  }, { pct: 50, km: 1.9  }, { pct: 75, km: 3.1  }, { pct: 95, km: 6.1   }], notes: `Goal-directed in dry mountain terrain. Check drainages, rock features, and sparse shelter. ${DBS_NOTE}` },

  // ── Despondent variants ──────────────────────────────────────────────────────
  despondent_urban:    { label: 'Despondent — Urban',               emoji: '⚠️', distances: [{ pct: 25, km: 0.1  }, { pct: 50, km: 0.5  }, { pct: 75, km: 1.5  }, { pct: 95, km: 13.1  }], notes: `Seeks isolation. Check rooftops, parking structures, bridges, and secluded urban spaces. ${DBS_NOTE}` },
  despondent_flat_dry: { label: 'Despondent — Flat / Dry',          emoji: '⚠️', distances: [{ pct: 25, km: 0.5  }, { pct: 50, km: 1.9  }, { pct: 75, km: 3.7  }, { pct: 95, km: 20.7  }], notes: `Seeks remote isolation. Check dry creek beds, coulees, and dense brush. May have a vehicle. ${DBS_NOTE}` },
  despondent_mtn_dry:  { label: 'Despondent — Mountain / Dry',      emoji: '⚠️', distances: [{ pct: 25, km: 0.8  }, { pct: 50, km: 1.6  }, { pct: 75, km: 3.4  }, { pct: 95, km: 18.0  }], notes: `Seeks elevated or isolated terrain. Check overlooks, cliff edges, and forested drainages. ${DBS_NOTE}` },
  despondent_flat_temp:{ label: 'Despondent — Flat / Temperate',    emoji: '⚠️', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 0.8  }, { pct: 75, km: 2.3  }, { pct: 95, km: 17.3  }], notes: `Seeks isolation near water or wooded areas in flat temperate terrain. ${DBS_NOTE}` },
  despondent_mtn_temp: { label: 'Despondent — Mountain / Temperate',emoji: '⚠️', distances: [{ pct: 25, km: 0.3  }, { pct: 50, km: 1.1  }, { pct: 75, km: 3.2  }, { pct: 95, km: 21.6  }], notes: `Wide range possible in mountain temperate terrain. Check water features, ridgelines, and remote drainages. ${DBS_NOTE}` },
};

export const RING_COLORS: Record<number, string> = {
  25: '#ef4444',
  50: '#f59e0b',
  75: '#3b82f6',
  95: '#6b7280',
};

/** Returns a GeoJSON circle polygon approximation for a lat/lon + radius in km */
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
