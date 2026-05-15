import aliasesData from '../../commute-data/place-aliases.json';

export const METRO_MANILA_BBOX = aliasesData.bbox as {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type AliasEntry = {
  lat: number;
  lng: number;
  name: string;
  confidence?: number;
  source?: string;
  osmId?: number;
};

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/!/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let index: Map<string, AliasEntry> | null = null;

function getIndex(): Map<string, AliasEntry> {
  if (index) return index;
  index = new Map();
  for (const place of aliasesData.places) {
    const entry: AliasEntry = {
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      confidence: place.confidence,
      source: place.source,
      osmId: 'osmId' in place ? (place as { osmId?: number }).osmId : undefined,
    };
    const keys = new Set([place.name, ...(place.aliases || [])].map(normalizeKey));
    for (const k of keys) {
      if (k.length >= 2) index.set(k, entry);
    }
  }
  return index;
}

export function resolveFromAliases(query: string): (AliasEntry & { displayName: string }) | null {
  const idx = getIndex();
  const key = normalizeKey(query);
  const hit = idx.get(key);
  if (hit) return { ...hit, displayName: hit.name };

  for (const [aliasKey, entry] of idx) {
    if (key.length >= 4 && (aliasKey.includes(key) || key.includes(aliasKey))) {
      return { ...entry, displayName: entry.name };
    }
  }
  return null;
}

export function isInMetroManila(lat: number, lng: number): boolean {
  const b = METRO_MANILA_BBOX;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function sanitizeGeocodeQuery(name: string): string {
  return name.replace(/!/g, ' ').replace(/\s+/g, ' ').trim();
}
