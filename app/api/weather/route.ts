import { NextRequest, NextResponse } from 'next/server';
import { logInfo, logError } from '@/lib/server-log';

interface WeatherResult {
  conditions: {
    tempC: number | null;
    feelsLikeC: number | null;
    windSpeedKmh: number | null;
    windGustKmh: number | null;
    windDirection: string | null;
    humidityPct: number | null;
    visibilityKm: number | null;
    pressureKPa: number | null;
    weatherCode: number | null;
    description: string;
  };
  forecast: {
    period: string;
    tempC: number;
    precipMm: number;
    windSpeedKmh: number;
    description: string;
  }[];
  alerts: {
    id: string;
    severity: string;
    title: string;
    issuedAt: string;
    description: string;
  }[];
  nearestCity: string;
  fetchedAt: string;
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

function windDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }

  logInfo('weather', `Fetching weather for lat=${lat} lon=${lon}`);
  try {
    // Open-Meteo — free, no API key, covers Alberta
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', [
      'temperature_2m', 'apparent_temperature', 'weather_code',
      'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
      'relative_humidity_2m', 'visibility', 'surface_pressure',
    ].join(','));
    url.searchParams.set('hourly', 'temperature_2m,weather_code,wind_speed_10m,precipitation');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max');
    url.searchParams.set('timezone', 'America/Edmonton');
    url.searchParams.set('forecast_days', '3');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const omRes = await fetch(url.toString());
    if (!omRes.ok) throw new Error(`Open-Meteo ${omRes.status}`);
    const om = await omRes.json();

    const cur = om.current;
    const daily = om.daily;

    const result: WeatherResult = {
      conditions: {
        tempC: cur.temperature_2m ?? null,
        feelsLikeC: cur.apparent_temperature ?? null,
        windSpeedKmh: cur.wind_speed_10m ?? null,
        windGustKmh: cur.wind_gusts_10m ?? null,
        windDirection: cur.wind_direction_10m != null ? windDeg(cur.wind_direction_10m) : null,
        humidityPct: cur.relative_humidity_2m ?? null,
        visibilityKm: cur.visibility != null ? cur.visibility / 1000 : null,
        pressureKPa: cur.surface_pressure != null ? cur.surface_pressure / 10 : null,
        weatherCode: cur.weather_code ?? null,
        description: WMO_CODES[cur.weather_code] ?? 'Unknown',
      },
      forecast: (daily.time as string[]).slice(0, 3).map((date: string, i: number) => ({
        period: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(date).toLocaleDateString('en-CA', { weekday: 'long' }),
        tempC: daily.temperature_2m_max[i],
        precipMm: daily.precipitation_sum[i] ?? 0,
        windSpeedKmh: daily.wind_speed_10m_max[i] ?? 0,
        description: WMO_CODES[daily.weather_code[i]] ?? 'Unknown',
      })),
      alerts: [],
      nearestCity: `${lat.toFixed(2)}°N, ${Math.abs(lon).toFixed(2)}°W`,
      fetchedAt: new Date().toISOString(),
    };

    // Try to get EC weather alerts for Alberta (non-blocking)
    try {
      const alertsRes = await fetch('https://dd.weather.gc.ca/alerts/cap/AB/Today/alerts_brief.json', {
        signal: AbortSignal.timeout(3000),
      });
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        const alerts = alertsData?.alerts ?? alertsData?.data ?? [];
        result.alerts = alerts.slice(0, 5).map((a: Record<string, string>, i: number) => ({
          id: String(i),
          severity: (a.severity ?? 'advisory').toLowerCase(),
          title: a.headline ?? a.event ?? 'Weather Alert',
          issuedAt: a.sent ?? new Date().toISOString(),
          description: a.description ?? '',
        }));
      }
    } catch {
      // alerts are best-effort
    }

    logInfo('weather', `Weather fetched OK for lat=${lat} lon=${lon}`);
    return NextResponse.json(result);
  } catch (err) {
    logError('weather', `Failed for lat=${lat} lon=${lon}`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Weather fetch failed' }, { status: 500 });
  }
}
