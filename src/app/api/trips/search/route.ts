import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { geocodeNominatim, parseLatLng } from '@/lib/geocode';

const WALK_THRESHOLD_M = 400;
const DEFAULT_RADIUS_M = 8000;

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

type RpcRow = Record<string, unknown>;

function mapRow(
  row: RpcRow,
  originLat?: number,
  originLng?: number
) {
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
    matchType: (row.match_type as string) || 'exact',
  };
}

async function rpcRows(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<RpcRow[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn} error:`, error.message);
    return [];
  }
  return (data as RpcRow[]) || [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = searchParams.get('origin') || '';
  const destination = searchParams.get('destination') || '';
  const radiusM = parseFloat(searchParams.get('radius_m') || String(DEFAULT_RADIUS_M));

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
  const byId = new Map<string, ReturnType<typeof mapRow>>();

  const addRows = (rows: RpcRow[], matchType = 'exact') => {
    for (const row of rows) {
      const mapped = mapRow({ ...row, match_type: matchType }, originLat, originLng);
      if (mapped.id) byId.set(String(mapped.id), mapped);
    }
  };

  // 1) Text match first (works best for spreadsheet place names)
  if (origin.trim() || destination.trim()) {
    addRows(
      await rpcRows(supabase, 'search_trip_options_by_text', {
        origin_text: origin.trim(),
        dest_text: destination.trim(),
      }),
      'exact'
    );
  }

  // 2) Geo match (nearest known places within radius)
  const hasCoords =
    originLat != null &&
    !isNaN(originLat) &&
    originLng != null &&
    !isNaN(originLng) &&
    destLat != null &&
    !isNaN(destLat) &&
    destLng != null &&
    !isNaN(destLng);

  if (hasCoords) {
    addRows(
      await rpcRows(supabase, 'search_trip_options', {
        origin_lng: originLng,
        origin_lat: originLat,
        dest_lng: destLng,
        dest_lat: destLat,
        radius_m: radiusM,
      }),
      'exact'
    );
  }

  // 3) Partial: trips from origin area OR to destination area
  if (byId.size === 0 && origin.trim() && destination.trim()) {
    addRows(
      await rpcRows(supabase, 'search_trip_options_partial', {
        origin_text: origin.trim(),
        dest_text: destination.trim(),
      }),
      'partial'
    );
  }

  const results = Array.from(byId.values()).sort((a, b) => {
    if (a.matchType !== b.matchType) {
      return a.matchType === 'exact' ? -1 : 1;
    }
    const distA = Number(a.originDistanceM || 0) + Number(a.destDistanceM || 0);
    const distB = Number(b.originDistanceM || 0) + Number(b.destDistanceM || 0);
    return distA - distB;
  });

  return NextResponse.json({
    results,
    meta: {
      count: results.length,
      hasExact: results.some((r) => r.matchType === 'exact'),
      hasPartial: results.some((r) => r.matchType === 'partial'),
    },
    geocoded: {
      origin: originLat != null ? { lat: originLat, lng: originLng } : null,
      destination: destLat != null ? { lat: destLat, lng: destLng } : null,
    },
  });
}
