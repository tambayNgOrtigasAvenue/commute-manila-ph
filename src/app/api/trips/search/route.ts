import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { geocodeNominatim, parseLatLng } from '@/lib/geocode';

const WALK_THRESHOLD_M = 400;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = searchParams.get('origin') || '';
  const destination = searchParams.get('destination') || '';
  const radiusM = parseFloat(searchParams.get('radius_m') || '2000');

  let originLat = searchParams.get('olat') ? parseFloat(searchParams.get('olat')!) : undefined;
  let originLng = searchParams.get('olng') ? parseFloat(searchParams.get('olng')!) : undefined;
  let destLat = searchParams.get('dlat') ? parseFloat(searchParams.get('dlat')!) : undefined;
  let destLng = searchParams.get('dlng') ? parseFloat(searchParams.get('dlng')!) : undefined;

  const originParsed = parseLatLng(origin);
  if (originParsed) {
    originLat = originParsed.lat;
    originLng = originParsed.lng;
  } else if (origin.trim() && (originLat == null || originLng == null)) {
    const geo = await geocodeNominatim(origin);
    if (geo) {
      originLat = geo.lat;
      originLng = geo.lng;
    }
  }

  const destParsed = parseLatLng(destination);
  if (destParsed) {
    destLat = destParsed.lat;
    destLng = destParsed.lng;
  } else if (destination.trim() && (destLat == null || destLng == null)) {
    const geo = await geocodeNominatim(destination);
    if (geo) {
      destLat = geo.lat;
      destLng = geo.lng;
    }
  }

  const supabase = getSupabase();
  let rows: Record<string, unknown>[] = [];

  if (
    originLat != null &&
    !isNaN(originLat) &&
    originLng != null &&
    !isNaN(originLng) &&
    destLat != null &&
    !isNaN(destLat) &&
    destLng != null &&
    !isNaN(destLng)
  ) {
    const { data, error } = await supabase.rpc('search_trip_options', {
      origin_lng: originLng,
      origin_lat: originLat,
      dest_lng: destLng,
      dest_lat: destLat,
      radius_m: radiusM,
    });
    if (error) {
      console.error('search_trip_options error:', error);
    } else if (data) {
      rows = data as Record<string, unknown>[];
    }
  }

  if (rows.length === 0 && (origin.trim() || destination.trim())) {
    const { data, error } = await supabase.rpc('search_trip_options_by_text', {
      origin_text: origin.trim(),
      dest_text: destination.trim(),
    });
    if (!error && data) rows = data as Record<string, unknown>[];
  }

  const results = rows.map((row) => {
    const boardLat = row.board_lat as number;
    const boardLng = row.board_lng as number;
    let walkLeg: { from: [number, number]; to: [number, number]; distanceM: number } | undefined;

    if (originLat != null && originLng != null && boardLat && boardLng) {
      const dist = haversineM(originLat, originLng, boardLat, boardLng);
      if (dist > WALK_THRESHOLD_M) {
        walkLeg = {
          from: [originLat, originLng],
          to: [boardLat, boardLng],
          distanceM: Math.round(dist),
        };
      }
    }

    return {
      id: row.id,
      originName: row.origin_name,
      destName: row.dest_name,
      originLat: row.origin_lat,
      originLng: row.origin_lng,
      destLat: row.dest_lat,
      destLng: row.dest_lng,
      modeSlug: row.mode_slug,
      modeLabel: row.mode_label,
      modeCategory: row.mode_category,
      lineName: row.line_name,
      lineDescription: row.line_description,
      fareRegular: Number(row.fare_regular),
      fareDiscounted: Number(row.fare_discounted),
      distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
      earliestTravelTime: row.earliest_travel_time ?? null,
      lastTravelTime: row.last_travel_time ?? null,
      frequency: row.frequency ?? null,
      operates24_7: Boolean(row.operates_24_7),
      stationSequence: (row.station_sequence as string[]) ?? [],
      source: row.source,
      pathGeojson: row.path_geojson,
      boardLat,
      boardLng,
      originDistanceM: row.origin_distance_m,
      destDistanceM: row.dest_distance_m,
      walkLeg,
    };
  });

  return NextResponse.json({
    results,
    geocoded: {
      origin: originLat != null ? { lat: originLat, lng: originLng } : null,
      destination: destLat != null ? { lat: destLat, lng: destLng } : null,
    },
  });
}
