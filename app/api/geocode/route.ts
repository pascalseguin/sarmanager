import { NextRequest, NextResponse } from 'next/server';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function hereGeocode(q: string, apiKey: string): Promise<NominatimResult[]> {
  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(q)}&apiKey=${encodeURIComponent(apiKey)}&limit=5&in=countryCode:CAN,USA`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HERE ${res.status}`);
  const data = await res.json() as { items?: { title: string; address?: { label?: string }; position: { lat: number; lng: number } }[] };
  return (data.items ?? []).map(item => ({
    display_name: item.address?.label ?? item.title,
    lat: String(item.position.lat),
    lon: String(item.position.lng),
  }));
}

async function nominatimGeocode(q: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&countrycodes=ca,us`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `SARManager/1.0 (${process.env.CONTACT_EMAIL ?? 'contact@example.com'})` },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json() as Promise<NominatimResult[]>;
}

async function hereReverseGeocode(lat: number, lon: number, apiKey: string): Promise<string> {
  const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lon}&apiKey=${encodeURIComponent(apiKey)}&lang=en&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HERE ${res.status}`);
  const data = await res.json() as { items?: { address?: Record<string, string> }[] };
  const addr = data?.items?.[0]?.address ?? {};
  return addr.city ?? addr.district ?? addr.county ?? addr.municipality ?? '';
}

async function nominatimReverseGeocode(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `SARManager/1.0 (${process.env.CONTACT_EMAIL ?? 'contact@example.com'})` },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json() as { address?: Record<string, string> };
  const addr = data?.address ?? {};
  return addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? '';
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  // ── Reverse geocoding: ?lat=&lon= ──────────────────────────────────────────
  const latParam = req.nextUrl.searchParams.get('lat');
  const lonParam = req.nextUrl.searchParams.get('lon');
  if (latParam && lonParam) {
    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);
    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ error: 'Invalid lat/lon' }, { status: 400 });
    }
    try {
      const municipality = key?.trim()
        ? await hereReverseGeocode(lat, lon, key.trim())
        : await nominatimReverseGeocode(lat, lon);
      return NextResponse.json({ municipality });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Reverse geocoding failed' }, { status: 500 });
    }
  }

  // ── Forward geocoding: ?q= ──────────────────────────────────────────────────
  const q = req.nextUrl.searchParams.get('q');
  if (!q?.trim()) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  try {
    const results = key?.trim()
      ? await hereGeocode(q, key.trim())
      : await nominatimGeocode(q);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Geocoding failed' }, { status: 500 });
  }
}
