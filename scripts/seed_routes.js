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

const dummyRoutes = [
  {
    raw_origin: 'Cubao',
    raw_destination: 'BGC',
    vehicle_type: 'bus',
    steps: ['Ride EDSA Carousel to Ayala', 'Ride BGC Bus to High Street'],
    data_source: 'manual',
    upvotes: 10,
    downvotes: 0
  },
  {
    raw_origin: 'Makati',
    raw_destination: 'Manila',
    vehicle_type: 'train',
    steps: ['Ride MRT-3 to Magallanes', 'Transfer to PNR to Tutuban'],
    data_source: 'manual',
    upvotes: 5,
    downvotes: 1
  },
  {
    raw_origin: 'Quezon City',
    raw_destination: 'Pasig',
    vehicle_type: 'jeepney',
    steps: ['Ride jeepney to Rosario', 'Ride another jeepney to Pasig Palengke'],
    data_source: 'manual',
    upvotes: 8,
    downvotes: 0
  }
];

async function seed() {
  console.log('Seeding dummy routes...');
  const { data, error } = await supabase.from('routes').insert(dummyRoutes);
  
  if (error) {
    console.error('Error seeding:', error.message);
  } else {
    console.log('Successfully seeded routes!');
  }
}

seed();
