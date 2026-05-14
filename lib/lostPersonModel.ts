// Simple ISRID-based lost person behavior model
// In reality, this would use statistical data from ISRID database

export function calculateSearchProbability(age: number, terrain: string, timeElapsed: number): number {
  // Base probability
  let prob = 0.5;

  // Adjust for age (children and elderly more likely to stay put)
  if (age < 12 || age > 65) {
    prob += 0.1;
  }

  // Adjust for terrain
  if (terrain === 'forest') {
    prob -= 0.1; // More likely to move in forest
  } else if (terrain === 'mountain') {
    prob += 0.05; // More likely to stay in mountains
  }

  // Adjust for time (probability decreases as time passes)
  prob -= timeElapsed * 0.02;

  return Math.max(0, Math.min(1, prob));
}

export function suggestSearchAreas(centerLat: number, centerLng: number, prob: number): Array<{lat: number, lng: number, radius: number}> {
  // Suggest concentric circles based on probability
  const areas = [];
  if (prob > 0.7) {
    areas.push({ lat: centerLat, lng: centerLng, radius: 500 }); // Close area
  }
  if (prob > 0.4) {
    areas.push({ lat: centerLat + 0.01, lng: centerLng, radius: 1000 }); // Medium
  }
  areas.push({ lat: centerLat, lng: centerLng + 0.01, radius: 2000 }); // Far
  return areas;
}