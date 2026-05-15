import {
  METRO_MANILA_BBOX,
  isInMetroManila,
  resolveFromAliases,
  sanitizeGeocodeQuery,
} from './placeAliases';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CommuteManila/1.0 (commute-manila-app)';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  osmId?: number;
  importance?: number;
  source?: string;
}

export async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const alias = resolveFromAliases(query);
  if (alias) {
    return {
      lat: alias.lat,
      lng: alias.lng,
      displayName: alias.displayName,
      osmId: alias.osmId,
      importance: alias.confidence ?? 0.95,
      source: alias.source ?? 'curated',
    };
  }

  const cleaned = sanitizeGeocodeQuery(query);
  const q = cleaned.includes('Philippines') ? cleaned : `${cleaned}, Metro Manila, Philippines`;
  const b = METRO_MANILA_BBOX;
  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '3',
    countrycodes: 'ph',
    viewbox: `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`,
    bounded: '1',
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const hit =
    data.find((h: { lat: string; lon: string }) =>
      isInMetroManila(parseFloat(h.lat), parseFloat(h.lon))
    ) || data[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!isInMetroManila(lat, lng)) return null;

  return {
    lat,
    lng,
    displayName: hit.display_name,
    osmId: hit.osm_id ? parseInt(hit.osm_id, 10) : undefined,
    importance: hit.importance ? parseFloat(hit.importance) : undefined,
    source: 'nominatim',
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
