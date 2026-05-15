const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CommuteManila/1.0 (commute-manila-app)';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  osmId?: number;
  importance?: number;
}

export async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const q = query.includes('Philippines') ? query : `${query}, Metro Manila, Philippines`;
  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const hit = data[0];
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    displayName: hit.display_name,
    osmId: hit.osm_id ? parseInt(hit.osm_id, 10) : undefined,
    importance: hit.importance ? parseFloat(hit.importance) : undefined,
  };
}

export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const match = input.trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}
