import { supabase } from './supabase';
import { geocodeNominatim, parseLatLng } from './geocode';

export interface Route {
  id: string;
  raw_origin: string;
  raw_destination: string;
  vehicle_type: 'jeepney' | 'modern_jeepney' | 'bus' | 'aircon_bus' | 'train' | 'multiple';
  steps: string[];
  data_source: string;
  upvotes: number;
  downvotes: number;
  distance_km?: number;
}

export interface TripOptionPath {
  type: string;
  coordinates: [number, number][];
}

export interface WalkLeg {
  from: [number, number];
  to: [number, number];
  distanceM: number;
}

export interface TripOption {
  id: string;
  originName: string;
  destName: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  modeSlug: string;
  modeLabel: string;
  modeCategory: string;
  lineName: string;
  lineDescription?: string;
  fareRegular: number;
  fareDiscounted: number;
  distanceKm?: number | null;
  earliestTravelTime?: string | null;
  lastTravelTime?: string | null;
  frequency?: string | null;
  operates24_7?: boolean;
  stationSequence?: string[];
  source: string;
  pathGeojson: TripOptionPath | null;
  boardLat: number;
  boardLng: number;
  originDistanceM: number;
  destDistanceM: number;
  walkLeg?: WalkLeg;
  kind: 'trip_option' | 'crowd_route';
}

const WALK_THRESHOLD_M = 400;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function attachWalkLeg(
  option: TripOption,
  userOrigin?: { lat: number; lng: number }
): TripOption {
  if (!userOrigin) return option;
  const dist = haversineM(userOrigin.lat, userOrigin.lng, option.boardLat, option.boardLng);
  if (dist <= WALK_THRESHOLD_M) return { ...option, originDistanceM: dist };
  return {
    ...option,
    originDistanceM: dist,
    walkLeg: {
      from: [userOrigin.lat, userOrigin.lng],
      to: [option.boardLat, option.boardLng],
      distanceM: Math.round(dist),
    },
  };
}

function mapRpcRow(row: Record<string, unknown>): TripOption {
  const path = row.path_geojson as TripOptionPath | null;
  return {
    id: row.id as string,
    originName: row.origin_name as string,
    destName: row.dest_name as string,
    originLat: row.origin_lat as number,
    originLng: row.origin_lng as number,
    destLat: row.dest_lat as number,
    destLng: row.dest_lng as number,
    modeSlug: row.mode_slug as string,
    modeLabel: row.mode_label as string,
    modeCategory: row.mode_category as string,
    lineName: row.line_name as string,
    lineDescription: (row.line_description as string) || undefined,
    fareRegular: Number(row.fare_regular),
    fareDiscounted: Number(row.fare_discounted),
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    earliestTravelTime: (row.earliest_travel_time as string) || null,
    lastTravelTime: (row.last_travel_time as string) || null,
    frequency: (row.frequency as string) || null,
    operates24_7: Boolean(row.operates_24_7),
    stationSequence: (row.station_sequence as string[]) || [],
    source: row.source as string,
    pathGeojson: path,
    boardLat: row.board_lat as number,
    boardLng: row.board_lng as number,
    originDistanceM: Number(row.origin_distance_m) || 0,
    destDistanceM: Number(row.dest_distance_m) || 0,
    kind: 'trip_option',
  };
}

export async function searchTripOptions(params: {
  origin: string;
  destination: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  radiusM?: number;
}): Promise<TripOption[]> {
  const { origin, destination, radiusM = 2000 } = params;
  let originLat = params.originLat;
  let originLng = params.originLng;
  let destLat = params.destLat;
  let destLng = params.destLng;

  const originCoords = parseLatLng(origin);
  if (originCoords) {
    originLat = originCoords.lat;
    originLng = originCoords.lng;
  } else if (origin.trim() && originLat == null) {
    const geo = await geocodeNominatim(origin);
    if (geo) {
      originLat = geo.lat;
      originLng = geo.lng;
    }
  }

  const destCoords = parseLatLng(destination);
  if (destCoords) {
    destLat = destCoords.lat;
    destLng = destCoords.lng;
  } else if (destination.trim() && destLat == null) {
    const geo = await geocodeNominatim(destination);
    if (geo) {
      destLat = geo.lat;
      destLng = geo.lng;
    }
  }

  let tripResults: TripOption[] = [];

  if (
    originLat != null &&
    originLng != null &&
    destLat != null &&
    destLng != null
  ) {
    const { data, error } = await supabase.rpc('search_trip_options', {
      origin_lng: originLng,
      origin_lat: originLat,
      dest_lng: destLng,
      dest_lat: destLat,
      radius_m: radiusM,
    });
    if (!error && data?.length) {
      tripResults = (data as Record<string, unknown>[]).map(mapRpcRow);
    }
  }

  if (tripResults.length === 0 && (origin.trim() || destination.trim())) {
    const { data, error } = await supabase.rpc('search_trip_options_by_text', {
      origin_text: origin.trim(),
      dest_text: destination.trim(),
    });
    if (!error && data?.length) {
      tripResults = (data as Record<string, unknown>[]).map(mapRpcRow);
    }
  }

  const userOrigin =
    originLat != null && originLng != null ? { lat: originLat, lng: originLng } : undefined;

  return tripResults.map((o) => attachWalkLeg(o, userOrigin));
}

export async function searchRoutes(origin: string, destination: string): Promise<Route[]> {
  const o = origin.trim();
  const d = destination.trim();

  if (!o && !d) return [];

  let query = supabase.from('routes').select('*');

  if (o && d) {
    query = query.or(
      `raw_origin.ilike.%${o}%,raw_destination.ilike.%${o}%,raw_origin.ilike.%${d}%,raw_destination.ilike.%${d}%`
    );
  } else {
    const term = o || d;
    query = query.or(`raw_origin.ilike.%${term}%,raw_destination.ilike.%${term}%`);
  }

  const { data, error } = await query.order('upvotes', { ascending: false }).limit(20);

  if (error) {
    console.error('Supabase Search Error:', error);
    return [];
  }

  return (data || []) as Route[];
}

export async function searchAllTransit(params: {
  origin: string;
  destination: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
}): Promise<TripOption[]> {
  const [trips, crowd] = await Promise.all([
    searchTripOptions(params),
    searchRoutes(params.origin, params.destination),
  ]);

  const crowdAsTrips: TripOption[] = crowd.map((r) => ({
    id: r.id,
    originName: r.raw_origin,
    destName: r.raw_destination,
    originLat: 0,
    originLng: 0,
    destLat: 0,
    destLng: 0,
    modeSlug: r.vehicle_type,
    modeLabel: r.vehicle_type.replace(/_/g, ' '),
    modeCategory: r.vehicle_type.includes('train') ? 'train' : 'bus',
    lineName: r.steps[0] || 'Community route',
    fareRegular: calculateFare(r.vehicle_type, r.distance_km || 5),
    fareDiscounted: calculateFare(r.vehicle_type, r.distance_km || 5) * 0.8,
    source: r.data_source,
    pathGeojson: null,
    boardLat: 0,
    boardLng: 0,
    originDistanceM: 0,
    destDistanceM: 0,
    kind: 'crowd_route' as const,
  }));

  if (trips.length > 0) return trips;
  return crowdAsTrips;
}

export async function voteRoute(routeId: string, type: 'up' | 'down') {
  const column = type === 'up' ? 'upvotes' : 'downvotes';

  const { data: currentRoute } = await supabase
    .from('routes')
    .select(column)
    .eq('id', routeId)
    .single();

  if (currentRoute) {
    const newValue = (currentRoute as Record<string, number>)[column] + 1;
    await supabase.from('routes').update({ [column]: newValue }).eq('id', routeId);
  }
}

export function calculateFare(vehicleType: string, distanceKm: number): number {
  const rates: Record<string, { base: number; baseDist: number; perKm: number }> = {
    jeepney: { base: 14, baseDist: 4, perKm: 1.5 },
    modern_jeepney: { base: 17, baseDist: 4, perKm: 1.8 },
    jeepney_traditional: { base: 14, baseDist: 4, perKm: 1.5 },
    jeepney_modern: { base: 17, baseDist: 4, perKm: 1.8 },
    bus: { base: 15, baseDist: 5, perKm: 2.25 },
    bus_ordinary: { base: 15, baseDist: 5, perKm: 2.25 },
    bus_carousel: { base: 15, baseDist: 5, perKm: 2.25 },
    aircon_bus: { base: 18, baseDist: 5, perKm: 2.65 },
    train: { base: 13, baseDist: 0, perKm: 1.0 },
    train_mrt3: { base: 28, baseDist: 0, perKm: 0 },
    train_lrt1: { base: 20, baseDist: 0, perKm: 0 },
    multiple: { base: 30, baseDist: 0, perKm: 2.0 },
  };

  const rate = rates[vehicleType] || rates.multiple;

  if (distanceKm <= rate.baseDist) {
    return rate.base;
  }

  const extraDist = distanceKm - rate.baseDist;
  return rate.base + Math.ceil(extraDist) * rate.perKm;
}
