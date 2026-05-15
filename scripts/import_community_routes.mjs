/**
 * Import approved routes from commute-data/reddit-htgtph-routes.json into Supabase.
 *
 * Usage:
 *   node scripts/import_community_routes.mjs
 *   node scripts/import_community_routes.mjs --include-pending   # import all parsed routes
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePlace } from './lib/placeGeocode.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_PATH = path.join(__dirname, '..', 'commute-data', 'reddit-htgtph-routes.json');

const MODE_SLUG_MAP = {
  jeepney: 'jeepney_traditional',
  'mrt-3': 'train_mrt3',
  mrt: 'train_mrt3',
  'lrt-1': 'train_lrt1',
  'lrt-2': 'train_lrt2',
  bus: 'bus_ordinary',
  uv: 'uv_express',
  ride_hail: 'tnvs_grab',
  ferry: 'ferry_pasig',
  tricycle: 'jeepney_traditional',
};

function pickModeSlug(modes) {
  for (const m of modes || []) {
    const slug = MODE_SLUG_MAP[m];
    if (slug) return slug;
  }
  return 'bus_ordinary';
}

async function main() {
  const includePending = process.argv.includes('--include-pending');
  if (!fs.existsSync(ROUTES_PATH)) {
    console.error(`Missing ${ROUTES_PATH}. Run: npm run fetch:reddit`);
    process.exit(1);
  }

  const { routes } = JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf8'));
  const toImport = routes.filter((r) => r.status === 'approved' || includePending);
  if (toImport.length === 0) {
    console.log('No routes to import. Approve routes in reddit-htgtph-routes.json or use --include-pending');
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: modes } = await supabase.from('transport_modes').select('id, slug');
  const modeBySlug = Object.fromEntries((modes || []).map((m) => [m.slug, m.id]));

  const placeCache = new Map();
  const lineCache = new Map();
  let imported = 0;
  let skipped = 0;

  async function getOrCreatePlace(name) {
    if (placeCache.has(name)) return placeCache.get(name);

    const { data: existing } = await supabase
      .from('places')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existing) {
      placeCache.set(name, existing.id);
      return existing.id;
    }

    const geo = await resolvePlace(name);
    if (!geo) {
      console.warn(`  geocode failed: ${name}`);
      return null;
    }

    const wkt = `POINT(${geo.lng} ${geo.lat})`;
    const { data: inserted, error } = await supabase
      .from('places')
      .insert({
        name,
        geom: wkt,
        nominatim_osm_id: geo.osmId,
        geocode_confidence: geo.importance ?? 0.85,
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`  place insert: ${name}`, error.message);
      return null;
    }
    placeCache.set(name, inserted.id);
    return inserted.id;
  }

  async function placeIdToGeo(placeId) {
    const { data } = await supabase.from('places').select('geom').eq('id', placeId).single();
    const match = data?.geom?.match?.(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) return null;
    return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }

  for (const route of toImport) {
    const originName = route.originText.trim();
    const destName = route.destText.trim();
    const originId = await getOrCreatePlace(originName);
    const destId = await getOrCreatePlace(destName);
    if (!originId || !destId) {
      skipped++;
      continue;
    }

    const originGeo = await placeIdToGeo(originId);
    const destGeo = await placeIdToGeo(destId);
    if (!originGeo || !destGeo) {
      skipped++;
      continue;
    }

    const modeSlug = pickModeSlug(route.modes);
    const modeId = modeBySlug[modeSlug];
    if (!modeId) {
      skipped++;
      continue;
    }

    const lineName = route.directions
      ? `Community: ${route.directions.slice(0, 80)}`
      : `r/HowToGetTherePH: ${route.title.slice(0, 80)}`;
    const lineKey = `${modeSlug}::${route.redditId}`;

    let lineId = lineCache.get(lineKey);
    if (!lineId) {
      const wkt = `LINESTRING(${originGeo.lng} ${originGeo.lat}, ${destGeo.lng} ${destGeo.lat})`;
      const { data: line, error: lineErr } = await supabase
        .from('transit_lines')
        .upsert(
          {
            mode_id: modeId,
            name: lineName,
            description: route.directions || route.title,
            station_sequence: [],
            path: wkt,
          },
          { onConflict: 'mode_id,name' }
        )
        .select('id')
        .single();

      if (lineErr) {
        const { data: existing } = await supabase
          .from('transit_lines')
          .select('id')
          .eq('mode_id', modeId)
          .eq('name', lineName)
          .maybeSingle();
        lineId = existing?.id;
      } else {
        lineId = line?.id;
      }
      if (lineId) lineCache.set(lineKey, lineId);
    }

    if (!lineId) {
      skipped++;
      continue;
    }

    const fare = route.fareHint ?? 0;
    const source = `reddit_htgtph:${route.redditId}`;

    const { error: tripErr } = await supabase.from('trip_options').upsert(
      {
        origin_place_id: originId,
        dest_place_id: destId,
        transit_line_id: lineId,
        fare_regular: fare,
        fare_discounted: fare > 0 ? Math.round(fare * 0.8 * 100) / 100 : 0,
        source,
        is_active: true,
        frequency: route.modes?.length ? `Modes: ${route.modes.join(', ')}` : null,
      },
      { onConflict: 'origin_place_id,dest_place_id,transit_line_id' }
    );

    if (tripErr) {
      console.warn(`  trip: ${originName} → ${destName}`, tripErr.message);
      skipped++;
      continue;
    }

    imported++;
    console.log(`Imported [${route.status}]: ${originName} → ${destName} (${source})`);
  }

  console.log(`\nDone. Imported ${imported}, skipped ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
