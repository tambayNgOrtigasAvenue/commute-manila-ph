/** Helpers for road-following route lines on the map. */

export type LatLng = { lat: number; lng: number };

/** True when the path is only a direct O–D segment (import skip or fallback). */
export function pathLooksLikeStraightLine(coords: [number, number][]): boolean {
  return coords.length <= 2;
}

export function pathToLatLngs(
  path: { type?: string; coordinates?: [number, number][] } | null | undefined
): [number, number][] {
  if (!path?.coordinates?.length) return [];
  return path.coordinates.map((c) => [c[1], c[0]] as [number, number]);
}

/** Fetch a driving route along the road network via OSRM (Metro Manila). */
export async function fetchOsrmRoadPath(waypoints: LatLng[]): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];

  const coordStr = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
    return [];
  }

  return (data.routes[0].geometry.coordinates as [number, number][]).map(
    (c) => [c[1], c[0]] as [number, number]
  );
}
