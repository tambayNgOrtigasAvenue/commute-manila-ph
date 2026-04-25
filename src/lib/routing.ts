import { supabase } from './supabase';

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

export async function searchRoutes(origin: string, destination: string): Promise<Route[]> {
  console.log(`Searching for routes: ${origin} -> ${destination}`);
  
  let query = supabase.from('routes').select('*');

  if (origin && destination) {
    // Search for routes that contain both origin and destination in any order
    query = query.or(`raw_origin.ilike.%${origin}%,raw_destination.ilike.%${origin}%,raw_origin.ilike.%${destination}%,raw_destination.ilike.%${destination}%`);
  } else if (origin) {
    query = query.or(`raw_origin.ilike.%${origin}%,raw_destination.ilike.%${origin}%`);
  } else if (destination) {
    query = query.or(`raw_origin.ilike.%${destination}%,raw_destination.ilike.%${destination}%`);
  } else {
    return [];
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error('Supabase error:', error.message);
    return [];
  }

  console.log(`Found ${data?.length || 0} routes`);
  return data as Route[];
}

export async function voteRoute(routeId: string, type: 'up' | 'down') {
  const column = type === 'up' ? 'upvotes' : 'downvotes';
  
  // Using an RPC call or direct update. For simplicity, we'll do a direct increment if possible, 
  // but Supabase usually requires an RPC for atomic increments.
  // We'll use a simple update for now, or just fetch and then update.
  const { data: currentRoute } = await supabase
    .from('routes')
    .select(column)
    .eq('id', routeId)
    .single();

  if (currentRoute) {
    const newValue = (currentRoute as any)[column] + 1;
    await supabase
      .from('routes')
      .update({ [column]: newValue })
      .eq('id', routeId);
  }
}

export function calculateFare(vehicleType: string, distanceKm: number): number {
  const rates: Record<string, { base: number, baseDist: number, perKm: number }> = {
    jeepney: { base: 14, baseDist: 4, perKm: 1.50 },
    modern_jeepney: { base: 17, baseDist: 4, perKm: 1.80 },
    bus: { base: 15, baseDist: 5, perKm: 2.25 },
    aircon_bus: { base: 18, baseDist: 5, perKm: 2.65 },
    train: { base: 13, baseDist: 0, perKm: 1.00 }, // Approximate for train
    multiple: { base: 30, baseDist: 0, perKm: 2.00 } // Weighted average for mixed
  };

  const rate = rates[vehicleType] || rates['multiple'];
  
  if (distanceKm <= rate.baseDist) {
    return rate.base;
  }
  
  const extraDist = distanceKm - rate.baseDist;
  return rate.base + Math.ceil(extraDist) * rate.perKm;
}
