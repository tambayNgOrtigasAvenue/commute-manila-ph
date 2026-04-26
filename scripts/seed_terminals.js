import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const majorTerminals = [
  // Bus & Integrated Terminals
  { name: "PITX (Parañaque Integrated Terminal Exchange)", type: "terminal", lat: 14.5095, lng: 120.9910, address: "Parañaque City" },
  { name: "One Ayala Terminal", type: "terminal", lat: 14.5503, lng: 121.0278, address: "Makati City" },
  { name: "Araneta City Bus Port", type: "terminal", lat: 14.6203, lng: 121.0573, address: "Cubao, Quezon City" },
  { name: "Victory Liner Cubao", type: "terminal", lat: 14.6242, lng: 121.0486, address: "EDSA, Quezon City" },
  { name: "Victory Liner Pasay", type: "terminal", lat: 14.5375, lng: 121.0011, address: "EDSA, Pasay City" },
  { name: "DLTB Bus Terminal Pasay", type: "terminal", lat: 14.5368, lng: 121.0015, address: "EDSA cor. Taft, Pasay" },
  
  // Rail Terminals (MRT/LRT)
  { name: "North Avenue Station (MRT-3)", type: "station", lat: 14.6521, lng: 121.0323, address: "Quezon City" },
  { name: "Taft Avenue Station (MRT-3)", type: "station", lat: 14.5376, lng: 121.0013, address: "Pasay City" },
  { name: "Baclaran Station (LRT-1)", type: "station", lat: 14.5282, lng: 120.9984, address: "Pasay City" },
  { name: "FPJ Roosevelt Station (LRT-1)", type: "station", lat: 14.6575, lng: 121.0211, address: "Quezon City" },
  { name: "Recto Station (LRT-2)", type: "station", lat: 14.6038, lng: 120.9831, address: "Manila" },
  { name: "Antipolo Station (LRT-2)", type: "station", lat: 14.6245, lng: 121.1214, address: "Antipolo/Marikina" },
  
  // Jeepney & Trike Hubs
  { name: "Araneta Center Jeepney Terminal", type: "jeepney_hub", lat: 14.6176, lng: 121.0543, address: "Cubao, Quezon City" },
  { name: "Guadalupe Jeepney Terminal", type: "jeepney_hub", lat: 14.5672, lng: 121.0455, address: "Makati City" },
  { name: "Monumento Circle Terminal", type: "jeepney_hub", lat: 14.6575, lng: 120.9841, address: "Caloocan" },
  { name: "Divisoria Hub", type: "jeepney_hub", lat: 14.6055, lng: 120.9735, address: "Manila" },
  { name: "Alabang South Station", type: "terminal", lat: 14.4175, lng: 121.0485, address: "Muntinlupa" }
];

async function seed() {
  console.log('Seeding major terminals...');
  
  for (const t of majorTerminals) {
    try {
      const point = `POINT(${t.lng} ${t.lat})`;
      const { error } = await supabase.from('locations').insert({
        name: t.name,
        type: t.type,
        address: t.address,
        coordinates: point
      });
      if (error) throw error;
      console.log(`Seeded: ${t.name}`);
    } catch (e) {
      console.error(`Error seeding ${t.name}:`, e.message);
    }
  }
}

seed();
