export interface UTMCoord {
  zone: number;
  letter: string;
  easting: number;
  northing: number;
  hemisphere: 'N' | 'S';
}

export function toUTM(lat: number, lon: number): UTMCoord {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = (a * a - b * b) / (a * a);
  const ePrime2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lonRef = (zone - 1) * 6 - 180 + 3;

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lonRefRad = (lonRef * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ePrime2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonRefRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5) / 120) +
    500000;

  const northing =
    k0 *
      (M +
        N *
          Math.tan(latRad) *
          (A ** 2 / 2 +
            ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
            ((61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6) / 720)) +
    (lat < 0 ? 10000000 : 0);

  const LETTERS = 'CDEFGHJKLMNPQRSTUVWX';
  const letterIdx = Math.min(Math.max(Math.floor((lat + 80) / 8), 0), LETTERS.length - 1);

  return {
    zone,
    letter: LETTERS[letterIdx],
    easting: Math.round(easting),
    northing: Math.round(northing),
    hemisphere: lat >= 0 ? 'N' : 'S',
  };
}

export function formatUTM(lat: number, lon: number): string {
  const u = toUTM(lat, lon);
  return `${u.zone}${u.letter} ${u.easting}E ${u.northing}N`;
}

export function fromUTM(zone: number, letter: string, easting: number, northing: number): { lat: number; lon: number } | null {
  if (zone < 1 || zone > 60) return null;
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = (a * a - b * b) / (a * a);
  const ePrime2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const x = easting - 500000;
  const y = letter.toUpperCase() < 'N' ? northing - 10000000 : northing;

  const lonRef = (zone - 1) * 6 - 180 + 3;
  const lonRefRad = (lonRef * Math.PI) / 180;

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ePrime2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * k0);

  const latRad =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ePrime2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ePrime2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lonRad =
    lonRefRad +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ePrime2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  const lat = (latRad * 180) / Math.PI;
  const lon = (lonRad * 180) / Math.PI;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { lat, lon };
}

export function parseUTMString(input: string): { lat: number; lon: number } | null {
  const clean = input.trim().toUpperCase().replace(/,/g, '');
  const m = clean.match(/^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{5,7})\s*E?\s+(\d{6,8})\s*N?$/);
  if (!m) return null;
  return fromUTM(parseInt(m[1]), m[2], parseInt(m[3]), parseInt(m[4]));
}
