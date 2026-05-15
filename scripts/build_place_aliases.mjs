/**
 * Geocode all unique spreadsheet place names and merge into place-aliases.json.
 * Run once (or after spreadsheet updates): npm run build:places
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { resolvePlace, reloadAliasIndex, METRO_MANILA_BBOX } from './lib/placeGeocode.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.join(__dirname, '..', 'commute-data', 'metro-manila-commuter-fares-routes.xlsx');
const ALIASES_PATH = path.join(__dirname, '..', 'commute-data', 'place-aliases.json');

function loadSpreadsheetPlaces() {
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const names = new Set();
  for (const r of rows) {
    if (r['Origin Location']) names.add(String(r['Origin Location']).trim());
    if (r['Destination Location']) names.add(String(r['Destination Location']).trim());
  }
  return [...names].sort();
}

function extractCity(name) {
  const m = name.match(/,\s*([^,]+)\s*$/);
  return m ? m[1].trim() : null;
}

function shortAliases(name) {
  const aliases = [];
  const beforeComma = name.split(',')[0].trim();
  if (beforeComma !== name) aliases.push(beforeComma);
  const paren = name.match(/\(([^)]+)\)/);
  if (paren) aliases.push(paren[1].trim());
  // Common shorthand
  const shortcuts = [
    [/cubao/i, 'cubao'],
    [/divisoria/i, 'motion divisoria'],
    [/sm megamall/i, 'megamall ortigas'],
    [/pitx/i, 'pitx paranaque'],
    [/fairview/i, 'fairview quezon city'],
    [/bgc/i, 'bonifacio global city'],
    [/naia terminal 3/i, 'naia t3'],
    [/lawton/i, 'lawton manila'],
    [/trinoma/i, 'trinoma north avenue'],
  ];
  for (const [re, alias] of shortcuts) {
    if (re.test(name)) aliases.push(alias);
  }
  return [...new Set(aliases.map((a) => a.toLowerCase()))];
}

async function main() {
  reloadAliasIndex();
  const existing = fs.existsSync(ALIASES_PATH)
    ? JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'))
    : { version: 1, places: [] };
  const byName = new Map(existing.places.map((p) => [p.name, p]));

  const names = loadSpreadsheetPlaces();
  console.log(`Resolving ${names.length} place names…`);

  let added = 0;
  let failed = 0;

  for (const name of names) {
    if (byName.has(name) && byName.get(name).lat) {
      console.log(`  skip (cached): ${name}`);
      continue;
    }

    const geo = await resolvePlace(name, { useNominatim: true });
    if (!geo) {
      console.warn(`  FAIL: ${name}`);
      failed++;
      continue;
    }

    byName.set(name, {
      name,
      city: extractCity(name),
      lat: Math.round(geo.lat * 1e6) / 1e6,
      lng: Math.round(geo.lng * 1e6) / 1e6,
      aliases: shortAliases(name),
      confidence: geo.importance ?? 0.9,
      source: geo.source,
      osmId: geo.osmId,
    });
    added++;
    console.log(`  ok: ${name} → ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (${geo.source})`);
  }

  const out = {
    version: 1,
    bbox: METRO_MANILA_BBOX,
    updatedAt: new Date().toISOString(),
    places: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(ALIASES_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nWrote ${out.places.length} places to ${ALIASES_PATH} (${added} new, ${failed} failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
