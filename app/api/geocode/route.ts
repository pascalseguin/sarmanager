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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  const key = req.nextUrl.searchParams.get('key');
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
