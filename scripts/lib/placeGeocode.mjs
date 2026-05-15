/**
 * Resolve place names to coordinates: curated aliases first, then Nominatim.
 * Shared by import scripts and build_place_aliases.mjs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIASES_PATH = path.join(__dirname, '..', '..', 'commute-data', 'place-aliases.json');

/** Metro Manila + nearby cities bounding box */
export const METRO_MANILA_BBOX = {
  minLat: 14.35,
  maxLat: 14.78,
  minLng: 120.88,
  maxLng: 121.15,
};

const NOMINATIM_DELAY_MS = 1100;
const USER_AGENT = 'CommuteManila/1.0 (place-geocode)';

let aliasIndex = null;

function normalizeKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/!/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadAliasIndex() {
  if (aliasIndex) return aliasIndex;
  aliasIndex = new Map();
  if (!fs.existsSync(ALIASES_PATH)) return aliasIndex;

  const data = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'));
  for (const place of data.places || []) {
    const entry = {
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      city: place.city,
      confidence: place.confidence ?? 0.95,
      source: place.source || 'curated',
      osmId: place.osmId,
    };
    const keys = new Set([place.name, ...(place.aliases || [])].map(normalizeKey));
    for (const k of keys) {
      if (k.length >= 2) aliasIndex.set(k, entry);
    }
  }
  return aliasIndex;
}

export function reloadAliasIndex() {
  aliasIndex = null;
  return loadAliasIndex();
}

export function resolveFromAliases(query) {
  const index = loadAliasIndex();
  const key = normalizeKey(query);
  if (index.has(key)) return { ...index.get(key), displayName: index.get(key).name };

  // Token overlap: "cubao" matches alias key containing cubao
  for (const [aliasKey, entry] of index) {
    if (key.length >= 4 && (aliasKey.includes(key) || key.includes(aliasKey))) {
      return { ...entry, displayName: entry.name, matchType: 'fuzzy_alias' };
    }
  }
  return null;
}

export function isInMetroManila(lat, lng) {
  return (
    lat >= METRO_MANILA_BBOX.minLat &&
    lat <= METRO_MANILA_BBOX.maxLat &&
    lng >= METRO_MANILA_BBOX.minLng &&
    lng <= METRO_MANILA_BBOX.maxLng
  );
}

export function sanitizeGeocodeQuery(name) {
  return String(name || '')
    .replace(/!/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function geocodeNominatim(query, { delayMs = NOMINATIM_DELAY_MS } = {}) {
  const cleaned = sanitizeGeocodeQuery(query);
  const q = cleaned.includes('Philippines')
    ? cleaned
    : `${cleaned}, Metro Manila, Philippines`;

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '3',
    countrycodes: 'ph',
    viewbox: `${METRO_MANILA_BBOX.minLng},${METRO_MANILA_BBOX.maxLat},${METRO_MANILA_BBOX.maxLng},${METRO_MANILA_BBOX.minLat}`,
    bounded: '1',
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (delayMs) await sleep(delayMs);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data?.length) return null;

  const hit =
    data.find((h) => isInMetroManila(parseFloat(h.lat), parseFloat(h.lon))) || data[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);

  if (!isInMetroManila(lat, lng)) return null;

  return {
    lat,
    lng,
    osmId: hit.osm_id ? parseInt(hit.osm_id, 10) : undefined,
    importance: hit.importance ? parseFloat(hit.importance) : undefined,
    displayName: hit.display_name,
    source: 'nominatim',
  };
}

/** Curated alias → Nominatim fallback */
export async function resolvePlace(query, { useNominatim = true } = {}) {
  const alias = resolveFromAliases(query);
  if (alias) {
    return {
      lat: alias.lat,
      lng: alias.lng,
      displayName: alias.displayName || alias.name,
      osmId: alias.osmId,
      importance: alias.confidence,
      source: alias.source || 'curated',
    };
  }

  if (!useNominatim) return null;
  return geocodeNominatim(query);
}
