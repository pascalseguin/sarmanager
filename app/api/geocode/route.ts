import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q?.trim()) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&countrycodes=ca,us`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SARManager/1.0 SAR incident management (pascal@phseguin.ca)' },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Geocoding failed' }, { status: 500 });
  }
}
