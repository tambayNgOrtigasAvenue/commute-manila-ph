/**
 * Import transit spreadsheet (CSV or XLSX) into Supabase.
 *
 * Usage:
 *   node scripts/import_transit_spreadsheet.js [path/to/file.xlsx|.csv]
 *   node scripts/import_transit_spreadsheet.js --qa-only   # write QA report without DB writes
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { resolvePlace, isInMetroManila } from './lib/placeGeocode.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(
  __dirname,
  '..',
  'commute-data',
  'metro-manila-commuter-fares-routes.xlsx'
);
const QA_REPORT_PATH = path.join(__dirname, '..', 'data', 'import_qa_report.csv');

const OVERPASS_DELAY_MS = 1500;
const USER_AGENT = 'CommuteManila/1.0 (import-script)';

const MODE_MAP = [
  [/tnvs|grab\s*sedan/i, 'tnvs_grab'],
  [/airport\s*taxi|yellow\s*taxi/i, 'taxi_airport'],
  [/pasig\s*river\s*ferry|river\s*ferry/i, 'ferry_pasig'],
  [/ordinary\s*city\s*bus/i, 'bus_ordinary'],
  [/edsa\s*carousel/i, 'bus_carousel'],
  [/p2p/i, 'bus_p2p'],
  [/bgc\s*bus/i, 'bus_bgc'],
  [/aircon/i, 'bus_aircon'],
  [/traditional\s*jeepney/i, 'jeepney_traditional'],
  [/modern\s*jeepney/i, 'jeepney_modern'],
  [/^jeepney$/i, 'jeepney_traditional'],
  [/lrt-?1/i, 'train_lrt1'],
  [/lrt-?2/i, 'train_lrt2'],
  [/mrt-?3/i, 'train_mrt3'],
  [/uv\s*express/i, 'uv_express'],
  [/^bus$/i, 'bus_ordinary'],
  [/train/i, 'train_mrt3'],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseFare(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/PhP/gi, '').replace(/₱/g, '').replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function mapMode(modeStr) {
  const s = String(modeStr || '').trim();
  for (const [re, slug] of MODE_MAP) {
    if (re.test(s)) return slug;
  }
  return 'bus_ordinary';
}

function parseDistanceKm(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, '').trim());
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

/** Excel stores times as day fraction (e.g. 0.5 = noon). */
function parseScheduleText(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const h12 = hours24 % 12 || 12;
    return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
  }
  return String(val).trim();
}

function detects24_7(earliest, last) {
  const combined = `${earliest || ''} ${last || ''}`.toLowerCase();
  return /24\s*\/\s*7|24hrs|24\s*hours/.test(combined);
}

/** "North Ave -> Quezon Ave -> Taft" => ['North Ave', 'Quezon Ave', 'Taft'] */
function parseStationSequence(routeName) {
  const s = String(routeName || '').trim();
  if (!/->|→/.test(s)) return [];
  return s
    .split(/\s*(?:->|→)\s*/)
    .map((st) => st.trim())
    .filter(Boolean);
}

function normalizeRouteName(name) {
  return String(name || '')
    .replace(/^via\s+/i, '')
    .trim();
}

function extractRoadTokens(routeName) {
  const n = normalizeRouteName(routeName);
  const tokens = [];
  const viaMatch = n.match(/via\s+([^,-]+)/i);
  if (viaMatch) tokens.push(viaMatch[1].trim());
  if (/commonwealth/i.test(n)) tokens.push('Commonwealth Avenue');
  if (/edsa/i.test(n)) tokens.push('EDSA');
  if (/slex/i.test(n)) tokens.push('South Luzon Expressway');
  if (/ortigas/i.test(n)) tokens.push('Ortigas Avenue');
  if (/\s+-\s+/.test(n)) {
    n.split(/\s+-\s+/)
      .map((p) => p.replace(/^via\s+/i, '').trim())
      .filter((p) => p.length > 2)
      .forEach((p) => tokens.push(p));
  }
  if (tokens.length === 0 && n.length > 2) tokens.push(n.split(/[-–]/)[0].trim());
  return [...new Set(tokens)].filter(Boolean);
}

function loadRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const text = fs.readFileSync(filePath, 'utf8');
    const wb = XLSX.read(text, { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function normalizeRow(raw) {
  const keys = Object.keys(raw).reduce((acc, k) => {
    acc[k.toLowerCase().replace(/\s+/g, '_')] = raw[k];
    return acc;
  }, {});

  const origin =
    keys.origin ||
    keys.origin_location ||
    keys['origin_location'] ||
    raw['Origin Location'] ||
    raw.Origin;
  const destination =
    keys.destination ||
    keys.destination_location ||
    raw['Destination Location'] ||
    raw.Destination;
  const mode =
    keys.mode ||
    keys.specific_transportation_mode ||
    keys.transportation_mode ||
    raw['Specific Transportation Mode'] ||
    raw.Mode;
  const routeName =
    keys.route_name ||
    keys.specific_route_taken ||
    keys.route ||
    raw['Specific Route Taken by Mode'] ||
    raw.Route;
  const fareRegular = parseFare(
    keys.fare_regular ||
      keys.fare___regular ||
      keys.fare_regular_rate_php ||
      raw['Fare - Regular Rate (PhP)'] ||
      raw['Fare - Regular'] ||
      raw.Fare
  );
  const fareDiscounted = parseFare(
    keys.fare_discounted ||
      keys.fare___discounted ||
      keys.fare_discounted_rate_php ||
      raw['Fare - Discounted Rate (PhP)'] ||
      raw['Fare - Discounted']
  );
  const distanceKm = parseDistanceKm(
    keys.distance_km || keys.distance || raw['Distance (km)']
  );
  const earliestTravelTime = parseScheduleText(
    keys.earliest_travel_time || raw['Earliest Travel Time']
  );
  const lastTravelTime = parseScheduleText(
    keys.last_travel_time || raw['Last Travel Time']
  );
  const frequency = parseScheduleText(keys.frequency || raw.Frequency);

  if (!origin || !destination) return null;

  const routeStr = String(routeName || 'Direct').trim();
  const stationSequence = parseStationSequence(routeStr);

  return {
    origin: String(origin).trim(),
    destination: String(destination).trim(),
    mode: String(mode || 'Bus').trim(),
    routeName: routeStr,
    stationSequence,
    fareRegular: fareRegular ?? 0,
    fareDiscounted: fareDiscounted ?? 0,
    distanceKm,
    earliestTravelTime,
    lastTravelTime,
    frequency,
    operates24_7: detects24_7(earliestTravelTime, lastTravelTime),
  };
}

async function fetchOverpassWays(bbox, roadTokens) {
  const [south, west, north, east] = bbox;
  const nameFilters = roadTokens
    .map((t) => {
      const escaped = t.replace(/"/g, '\\"');
      return `way["highway"]["name"~"${escaped}",i](${south},${west},${north},${east});`;
    })
    .join('\n');

  const query = `[out:json][timeout:25];
(
  ${nameFilters}
);
out geom;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  await sleep(OVERPASS_DELAY_MS);

  if (!res.ok) return [];
  const json = await res.json();
  return json.elements || [];
}

function waysToLineString(ways, originLng, originLat, destLng, destLat) {
  const segments = [];
  const wayIds = [];

  for (const way of ways) {
    if (!way.geometry?.length) continue;
    wayIds.push(way.id);
    const coords = way.geometry.map((n) => [n.lon, n.lat]);
    segments.push({ coords, way });
  }

  if (segments.length === 0) return { wkt: null, wayIds: [] };

  segments.sort((a, b) => {
    const aMid = a.coords[Math.floor(a.coords.length / 2)];
    const bMid = b.coords[Math.floor(b.coords.length / 2)];
    const da =
      (aMid[0] - originLng) ** 2 + (aMid[1] - originLat) ** 2;
    const db =
      (bMid[0] - originLng) ** 2 + (bMid[1] - originLat) ** 2;
    return da - db;
  });

  const merged = [];
  for (const seg of segments) {
    for (const c of seg.coords) {
      if (
        merged.length === 0 ||
        merged[merged.length - 1][0] !== c[0] ||
        merged[merged.length - 1][1] !== c[1]
      ) {
        merged.push(c);
      }
    }
  }

  if (merged.length < 2) {
    merged.length = 0;
    merged.push([originLng, originLat], [destLng, destLat]);
  }

  const wkt = `LINESTRING(${merged.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`;
  return { wkt, wayIds };
}

function bboxFromPoints(lng1, lat1, lng2, lat2, bufferDeg = 0.03) {
  const south = Math.min(lat1, lat2) - bufferDeg;
  const north = Math.max(lat1, lat2) + bufferDeg;
  const west = Math.min(lng1, lng2) - bufferDeg;
  const east = Math.max(lng1, lng2) + bufferDeg;
  return [south, west, north, east];
}

async function buildPath(originGeo, destGeo, routeName, skipOverpass = false) {
  if (skipOverpass) {
    const wkt = `LINESTRING(${originGeo.lng} ${originGeo.lat}, ${destGeo.lng} ${destGeo.lat})`;
    return { wkt, wayIds: [], pathSource: 'straight' };
  }
  const tokens = extractRoadTokens(routeName);
  const bbox = bboxFromPoints(
    originGeo.lng,
    originGeo.lat,
    destGeo.lng,
    destGeo.lat
  );

  try {
    const ways = await fetchOverpassWays(bbox, tokens);
    const { wkt, wayIds } = waysToLineString(
      ways,
      originGeo.lng,
      originGeo.lat,
      destGeo.lng,
      destGeo.lat
    );
    if (wkt) return { wkt, wayIds, pathSource: 'overpass' };
  } catch (e) {
    console.warn('Overpass failed:', e.message);
  }

  const wkt = `LINESTRING(${originGeo.lng} ${originGeo.lat}, ${destGeo.lng} ${destGeo.lat})`;
  return { wkt, wayIds: [], pathSource: 'straight' };
}

function writeQaReport(rows) {
  const header = 'row,origin,destination,issue,detail\n';
  const body = rows
    .map((r) =>
      [r.row, `"${r.origin}"`, `"${r.destination}"`, r.issue, `"${(r.detail || '').replace(/"/g, '""')}"`].join(',')
    )
    .join('\n');
  fs.writeFileSync(QA_REPORT_PATH, header + body, 'utf8');
  console.log(`QA report written: ${QA_REPORT_PATH}`);
}

async function main() {
  const args = process.argv.slice(2);
  const qaOnly = args.includes('--qa-only');
  const skipOverpass = args.includes('--skip-overpass');
  const filePath = args.find((a) => !a.startsWith('--')) || DEFAULT_DATA_FILE;

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rawRows = loadRows(filePath);
  const rows = rawRows.map(normalizeRow).filter(Boolean);

  console.log(`Loaded ${rows.length} rows from ${filePath}`);

  const { data: modes } = await supabase.from('transport_modes').select('id, slug');
  const modeBySlug = Object.fromEntries((modes || []).map((m) => [m.slug, m.id]));

  const placeCache = new Map();
  const lineCache = new Map();
  const qaIssues = [];

  async function getOrCreatePlace(name) {
    if (placeCache.has(name)) return placeCache.get(name);

    const { data: existing } = await supabase
      .from('places')
      .select('id, geocode_confidence')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      placeCache.set(name, existing.id);
      return existing.id;
    }

    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('lat, lng, raw_json')
      .eq('query_text', name)
      .maybeSingle();

    let geo = cached
      ? { lat: cached.lat, lng: cached.lng, importance: cached.raw_json?.importance }
      : null;

    if (!geo) {
      geo = await resolvePlace(name);
      if (geo && !qaOnly) {
        await supabase.from('geocode_cache').upsert({
          query_text: name,
          lat: geo.lat,
          lng: geo.lng,
          raw_json: {
            displayName: geo.displayName,
            importance: geo.importance,
            source: geo.source,
          },
        });
      }
    }

    if (geo && !isInMetroManila(geo.lat, geo.lng)) {
      qaIssues.push({
        row: name,
        origin: name,
        destination: '',
        issue: 'outside_metro_manila',
        detail: `${geo.lat},${geo.lng}`,
      });
      return null;
    }

    if (!geo) {
      qaIssues.push({ row: name, origin: name, destination: '', issue: 'geocode_failed', detail: name });
      return null;
    }

    if (geo.importance != null && geo.importance < 0.2) {
      qaIssues.push({
        row: name,
        origin: name,
        destination: '',
        issue: 'low_confidence_geocode',
        detail: `importance=${geo.importance}`,
      });
    }

    if (qaOnly) {
      placeCache.set(name, 'qa-placeholder');
      return 'qa-placeholder';
    }

    const wkt = `POINT(${geo.lng} ${geo.lat})`;
    const { data: inserted, error } = await supabase
      .from('places')
      .insert({
        name,
        geom: wkt,
        nominatim_osm_id: geo.osmId,
        geocode_confidence: geo.importance,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Place insert error:', name, error.message);
      qaIssues.push({ row: name, origin: name, destination: '', issue: 'place_insert_error', detail: error.message });
      return null;
    }

    placeCache.set(name, inserted.id);
    return inserted.id;
  }

  async function getOrCreateLine(modeSlug, routeName, originGeo, destGeo, stationSequence = []) {
    const key = `${modeSlug}::${routeName}`;
    if (lineCache.has(key)) return lineCache.get(key);

    const modeId = modeBySlug[modeSlug];
    if (!modeId) {
      qaIssues.push({ row: routeName, origin: '', destination: '', issue: 'unknown_mode', detail: modeSlug });
      return null;
    }

    const { data: existing } = await supabase
      .from('transit_lines')
      .select('id, path')
      .eq('mode_id', modeId)
      .eq('name', routeName)
      .maybeSingle();

    if (existing) {
      lineCache.set(key, existing.id);
      return existing.id;
    }

    const pathResult = await buildPath(originGeo, destGeo, routeName, skipOverpass);

    if (pathResult.pathSource === 'straight') {
      qaIssues.push({
        row: routeName,
        origin: '',
        destination: '',
        issue: 'path_fallback_straight',
        detail: routeName,
      });
    }

    if (qaOnly) {
      lineCache.set(key, 'qa-line');
      return 'qa-line';
    }

    const { data: inserted, error } = await supabase
      .from('transit_lines')
      .insert({
        mode_id: modeId,
        name: routeName,
        description: normalizeRouteName(routeName),
        station_sequence: stationSequence.length > 0 ? stationSequence : [],
        path: pathResult.wkt,
        osm_way_ids: pathResult.wayIds,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Line insert error:', routeName, error.message);
      return null;
    }

    lineCache.set(key, inserted.id);
    return inserted.id;
  }

  async function placeIdToGeo(placeId) {
    const { data } = await supabase.from('places').select('geom').eq('id', placeId).single();
    if (!data?.geom || typeof data.geom !== 'string') return null;
    const match = data.geom.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) return null;
    return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }

  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const modeSlug = mapMode(row.mode);

    if (qaOnly) continue;

    const originId = await getOrCreatePlace(row.origin);
    const destId = await getOrCreatePlace(row.destination);
    if (!originId || !destId) {
      qaIssues.push({
        row: i + 2,
        origin: row.origin,
        destination: row.destination,
        issue: 'geocode_failed',
        detail: 'origin or destination place',
      });
      continue;
    }

    const originGeo = await placeIdToGeo(originId);
    const destGeo = await placeIdToGeo(destId);
    if (!originGeo || !destGeo) continue;

    const lineId = await getOrCreateLine(
      modeSlug,
      row.routeName,
      originGeo,
      destGeo,
      row.stationSequence
    );
    if (!lineId) continue;

    const { error: tripErr } = await supabase.from('trip_options').upsert(
      {
        origin_place_id: originId,
        dest_place_id: destId,
        transit_line_id: lineId,
        fare_regular: row.fareRegular,
        fare_discounted: row.fareDiscounted,
        distance_km: row.distanceKm,
        earliest_travel_time: row.earliestTravelTime,
        last_travel_time: row.lastTravelTime,
        frequency: row.frequency,
        operates_24_7: row.operates24_7,
        source: 'spreadsheet_v1',
        is_active: true,
      },
      { onConflict: 'origin_place_id,dest_place_id,transit_line_id' }
    );

    if (tripErr) {
      qaIssues.push({
        row: i + 2,
        origin: row.origin,
        destination: row.destination,
        issue: 'trip_upsert_error',
        detail: tripErr.message,
      });
      continue;
    }

    const { data: existingStops } = await supabase
      .from('line_stops')
      .select('id')
      .eq('transit_line_id', lineId)
      .limit(1);

    if (!existingStops?.length) {
      const { data: op } = await supabase.from('places').select('geom').eq('id', originId).single();
      const { data: dp } = await supabase.from('places').select('geom').eq('id', destId).single();
      if (op?.geom) {
        await supabase.from('line_stops').insert({
          transit_line_id: lineId,
          place_id: originId,
          geom: op.geom,
          sequence: 0,
          stop_role: 'board',
        });
      }
      if (dp?.geom) {
        await supabase.from('line_stops').insert({
          transit_line_id: lineId,
          place_id: destId,
          geom: dp.geom,
          sequence: 1,
          stop_role: 'alight',
        });
      }
    }

    imported++;
    console.log(`Imported: ${row.origin} → ${row.destination} (${modeSlug})`);
  }

  writeQaReport(qaIssues);

  if (qaOnly) {
    console.log(`QA-only run complete. ${qaIssues.length} issue(s) logged.`);
    return;
  }

  console.log(`Done. Imported/updated ${imported} trip option(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
