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
  const o = origin.trim();
  const d = destination.trim();
  
  console.log(`Searching for routes with: origin="${o}", destination="${d}"`);
  
  if (!o && !d) return [];

  let query = supabase.from('routes').select('*');

  if (o && d) {
    // Search for routes where BOTH terms appear somewhere in origin or destination
    // Note: Supabase .or() with complex conditions can be picky. 
    // We'll search for things that match EITHER and then filter or just keep it simple.
    query = query.or(`raw_origin.ilike.%${o}%,raw_destination.ilike.%${o}%,raw_origin.ilike.%${d}%,raw_destination.ilike.%${d}%`);
  } else {
    const term = o || d;
    query = query.or(`raw_origin.ilike.%${term}%,raw_destination.ilike.%${term}%`);
  }

  const { data, error } = await query.order('upvotes', { ascending: false }).limit(20);

  if (error) {
    console.error('Supabase Search Error:', error);
    return [];
  }

  if (!data || data.length === 0) {
    console.warn('No routes found in database for these terms.');
  }

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
