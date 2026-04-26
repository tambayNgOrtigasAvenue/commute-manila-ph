import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function seedBoundaries() {
  const geojsonPath = './metron-manila.geojson';
  
  if (!fs.existsSync(geojsonPath)) {
    console.error("File 'metron-manila.geojson' not found.");
    return;
  }

  const rawData = fs.readFileSync(geojsonPath, 'utf8');
  const geojson = JSON.parse(rawData);

  console.log(`Processing ${geojson.features.length} features...`);

  for (const feature of geojson.features) {
    const props = feature.properties;
    
    // Robust name detection
    const name = props.name || props.NAME_3 || props.NAME_2 || props.NAME_1 || 
                 props.ADM3_EN || props.ADM2_EN || props.municipali || "Unknown Area";
    
    // OSM admin_level: 6 is City/Municipality, 10 is Barangay
    const rawLevel = props.admin_level || props.admin_lvl;
    const adminLevel = parseInt(rawLevel) || (props.NAME_3 ? 10 : 6);
    
    // Map OSM levels to our internal app levels
    // We'll treat 6 as "City" and 10 as "Barangay"
    const boundaryType = adminLevel <= 6 ? 'city' : 'barangay';

    try {
      const { error } = await supabase.rpc('insert_boundary_geojson', {
        p_name: name,
        p_admin_level: adminLevel,
        p_type: boundaryType,
        p_geom_json: feature.geometry
      });

      if (error) {
        console.error(`Failed to insert ${name}: ${error.message}`);
      } else {
        console.log(`✅ Inserted ${boundaryType}: ${name} (Level ${adminLevel})`);
      }
    } catch (e) {
      console.error(`Unexpected error for ${name}:`, e.message);
    }
  }
  console.log("Finished seeding boundaries!");
}

seedBoundaries();
