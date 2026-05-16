# Commute data

## Files

| File | Purpose |
|------|---------|
| `metro-manila-commuter-fares-routes.xlsx` | Primary fare sheet (~76 routes) |
| `metro-manila-transport-terminals.xlsx` | Terminal locations (lat/lng) for map layer |
| `place-aliases.json` | Curated coordinates + aliases for accurate geocoding |
| `reddit-htgtph-routes.json` | Parsed routes from [r/HowToGetTherePH](https://www.reddit.com/r/HowToGetTherePH/) |
| `reddit-htgtph-raw.json` | Raw Reddit posts (reference) |

## Commands

```bash
# Refresh curated place coordinates from spreadsheet + Nominatim
npm run build:places

# Re-import spreadsheet into Supabase (accurate geocoding via place-aliases)
npm run import:commute

# Seed map terminals from metro-manila-transport-terminals.xlsx
npm run seed:terminals:fresh

# Fetch community routes from Reddit
npm run fetch:reddit

# Approve routes in reddit-htgtph-routes.json (set "status": "approved"), then:
npm run import:community

# Or import all parsed routes (review quality first)
npm run import:community -- --include-pending
```

## Reddit workflow

1. `npm run fetch:reddit` — downloads posts and parses origin/destination from titles.
2. Open `reddit-htgtph-routes.json` and set `"status": "approved"` on routes you trust.
3. `npm run import:community` — inserts approved trips with source `reddit_htgtph:<post_id>`.

Community trips show **Source: r/HowToGetTherePH** in the app. Fares are taken from post text when mentioned; otherwise ₱0 (directions-only).

## Place accuracy

Geocoding order: **curated alias** → **Nominatim** (bounded to Metro Manila). Edit `place-aliases.json` to fix wrong pins, then re-run `npm run import:commute`.
