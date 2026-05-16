/** Parse PostGIS point from Supabase (EWKB hex, WKT, or GeoJSON). */
export function parsePointCoordinates(
  coordinates: unknown
): { lat: number; lng: number } | null {
  if (coordinates == null) return null;

  if (typeof coordinates === 'string') {
    const wkt = coordinates.match(/POINT\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)/i);
    if (wkt) {
      const lng = parseFloat(wkt[1]);
      const lat = parseFloat(wkt[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (/^[0-9a-fA-F]+$/.test(coordinates) && coordinates.length >= 42) {
      return parseEwkbPointHex(coordinates);
    }
    return null;
  }

  if (typeof coordinates === 'object') {
    const geo = coordinates as { type?: string; coordinates?: number[] };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      const [lng, lat] = geo.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }

  return null;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseEwkbPointHex(hex: string): { lat: number; lng: number } | null {
  try {
    const bytes = hexToBytes(hex);
    if (bytes.length < 21) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const littleEndian = view.getUint8(0) === 1;
    const type = view.getUint32(1, littleEndian);
    const hasSrid = (type & 0x20000000) !== 0;
    const baseType = type & 0xff;
    if (baseType !== 1) return null;

    let offset = 5;
    if (hasSrid) offset += 4;

    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
