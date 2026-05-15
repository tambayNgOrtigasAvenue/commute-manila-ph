import { NextRequest, NextResponse } from 'next/server';
import { fetchOsrmRoadPath, type LatLng } from '@/lib/routeGeometry';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const points: LatLng[] = [];

  const pairs = [
    ['olat', 'olng'],
    ['dlat', 'dlng'],
  ] as const;

  for (const [latKey, lngKey] of pairs) {
    const lat = parseFloat(searchParams.get(latKey) || '');
    const lng = parseFloat(searchParams.get(lngKey) || '');
    if (!isNaN(lat) && !isNaN(lng)) {
      points.push({ lat, lng });
    }
  }

  // Optional via points: via=lat,lng|lat,lng
  const via = searchParams.get('via');
  if (via) {
    const viaPoints = via
      .split('|')
      .map((pair) => {
        const [lat, lng] = pair.split(',').map((v) => parseFloat(v.trim()));
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng };
      })
      .filter((p): p is LatLng => p !== null);

    if (viaPoints.length > 0 && points.length >= 2) {
      points.splice(1, 0, ...viaPoints);
    }
  }

  if (points.length < 2) {
    return NextResponse.json({ error: 'Need at least origin and destination coordinates' }, { status: 400 });
  }

  const coordinates = await fetchOsrmRoadPath(points);

  if (coordinates.length < 2) {
    return NextResponse.json(
      { error: 'Could not compute road route', coordinates: [] },
      { status: 502 }
    );
  }

  return NextResponse.json({
    coordinates,
    source: 'osrm',
    profile: 'driving',
  });
}
