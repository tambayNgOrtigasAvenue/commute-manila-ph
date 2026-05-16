/**
 * Seed locations from commute-data/metro-manila-transport-terminals.xlsx
 * (exact Latitude / Longitude per terminal).
 *
 * Usage:
 *   npm run seed:terminals
 *   npm run seed:terminals:fresh
 *   node scripts/seed_terminals.mjs path/to/other.xlsx
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_XLSX = path.join(
  __dirname,
  '..',
  'commute-data',
  'metro-manila-transport-terminals.xlsx'
);

const SEED_TYPES = ['bus', 'jeepney', 'e_jeepney', 'tricycle', 'train'];
const LEGACY_TYPES = ['terminal', 'station', 'jeepney_hub'];

/** Spreadsheet "Transportation Mode" → DB type for map colors */
function mapTransportMode(mode) {
  const s = String(mode || '')
    .toLowerCase()
    .trim();
  if (/train|rail|mrt|lrt/.test(s)) return 'train';
  if (/e[-\s]?jeep|modern\s*jeep/.test(s)) return 'e_jeepney';
  if (/jeepney|jeep/.test(s)) return 'jeepney';
  if (/tricycle|trike/.test(s)) return 'tricycle';
  if (/bus|p2p|carousel/.test(s)) return 'bus';
  return null;
}

function parseCoord(val) {
  if (val == null || val === '') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function loadTerminalsFromXlsx(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => /terminal/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

  const terminals = [];
  const skipped = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const keys = Object.keys(raw).reduce((acc, k) => {
      acc[k.toLowerCase().trim()] = raw[k];
      return acc;
    }, {});

    const name =
      keys['name of terminal'] ||
      keys.name ||
      keys.terminal ||
      raw['Name of Terminal'];
    const mode =
      keys['transportation mode'] ||
      keys.mode ||
      keys.type ||
      raw['Transportation Mode'];
    const address =
      keys['barangay and city'] ||
      keys.address ||
      keys.location ||
      raw['Barangay and City'];
    const lat = parseCoord(keys.latitude ?? keys.lat ?? raw.Latitude);
    const lng = parseCoord(keys.longitude ?? keys.lng ?? raw.Longitude);

    if (!name) {
      skipped.push({ row: i + 2, reason: 'missing name' });
      continue;
    }

    const type = mapTransportMode(mode);
    if (!type) {
      skipped.push({ row: i + 2, name, reason: `unknown mode: ${mode}` });
      continue;
    }

    if (lat == null || lng == null) {
      skipped.push({ row: i + 2, name, reason: 'missing lat/lng' });
      continue;
    }

    if (lat < 14 || lat > 15 || lng < 120 || lng > 122) {
      skipped.push({ row: i + 2, name, reason: `coords out of range: ${lat}, ${lng}` });
      continue;
    }

    terminals.push({
      name: String(name).trim(),
      type,
      lat,
      lng,
      address: address ? String(address).trim() : null,
      sourceMode: String(mode || '').trim(),
    });
  }

  return { terminals, skipped, sheetName };
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  const fileArg = process.argv.find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
  const filePath = fileArg || DEFAULT_XLSX;

  const { terminals, skipped, sheetName } = loadTerminalsFromXlsx(filePath);
  console.log(`Loaded ${terminals.length} terminals from "${sheetName}" (${filePath})`);

  if (skipped.length) {
    console.warn(`Skipped ${skipped.length} row(s):`);
    for (const s of skipped) console.warn(`  row ${s.row}: ${s.name || '?'} — ${s.reason}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (fresh) {
    const { error: delErr } = await supabase
      .from('locations')
      .delete()
      .in('type', [...SEED_TYPES, ...LEGACY_TYPES]);
    if (delErr) console.warn('Fresh delete warning:', delErr.message);
    else console.log('Cleared existing terminal rows (--fresh).');
  }

  const namesInSheet = new Set(terminals.map((t) => t.name));
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  const byType = Object.fromEntries(SEED_TYPES.map((t) => [t, 0]));

  for (const t of terminals) {
    byType[t.type] = (byType[t.type] || 0) + 1;
    const point = `POINT(${t.lng} ${t.lat})`;

    const { data: existing } = await supabase
      .from('locations')
      .select('id')
      .eq('name', t.name)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('locations')
        .update({
          type: t.type,
          address: t.address,
          coordinates: point,
        })
        .eq('id', existing.id);
      if (error) {
        console.error(`Update failed: ${t.name}`, error.message);
        failed++;
      } else {
        updated++;
        console.log(`Updated [${t.type}] ${t.name} @ ${t.lat}, ${t.lng}`);
      }
    } else {
      const { error } = await supabase.from('locations').insert({
        name: t.name,
        type: t.type,
        address: t.address,
        coordinates: point,
      });
      if (error) {
        console.error(`Insert failed: ${t.name}`, error.message);
        failed++;
      } else {
        inserted++;
        console.log(`Inserted [${t.type}] ${t.name} @ ${t.lat}, ${t.lng}`);
      }
    }
  }

  // Optional: remove seeded types not present in spreadsheet (only with --fresh)
  if (fresh && namesInSheet.size > 0) {
    const { data: orphans } = await supabase
      .from('locations')
      .select('id, name')
      .in('type', SEED_TYPES);
    const toRemove = (orphans || []).filter((r) => !namesInSheet.has(r.name));
    if (toRemove.length) {
      const { error } = await supabase
        .from('locations')
        .delete()
        .in(
          'id',
          toRemove.map((r) => r.id)
        );
      if (!error) console.log(`Removed ${toRemove.length} terminal(s) not in spreadsheet.`);
    }
  }

  console.log(`\nDone. Inserted ${inserted}, updated ${updated}, failed ${failed}.`);
  console.log(
    'By type:',
    Object.entries(byType)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
  );
  console.log('Map colors: bus=blue, jeepney=orange, e_jeepney=green, tricycle=violet, train=red');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
