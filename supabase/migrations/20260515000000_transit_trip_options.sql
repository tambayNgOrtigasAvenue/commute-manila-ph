-- Transit trip options schema (spreadsheet OD + fares + corridors)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Transport modes
CREATE TABLE IF NOT EXISTS transport_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- category: bus | jeepney | train | uv | ferry | taxi | ride_hail
INSERT INTO transport_modes (slug, label, category) VALUES
  ('bus_ordinary', 'Ordinary City Bus', 'bus'),
  ('bus_carousel', 'EDSA Carousel Bus', 'bus'),
  ('bus_p2p', 'P2P Bus', 'bus'),
  ('bus_bgc', 'BGC Bus', 'bus'),
  ('bus_aircon', 'Aircon Bus', 'bus'),
  ('jeepney_traditional', 'Traditional Jeepney', 'jeepney'),
  ('jeepney_modern', 'Modern Jeepney', 'jeepney'),
  ('train_lrt1', 'LRT-1', 'train'),
  ('train_lrt2', 'LRT-2', 'train'),
  ('train_mrt3', 'MRT-3', 'train'),
  ('uv_express', 'UV Express', 'uv'),
  ('tnvs_grab', 'TNVS (Grab Sedan)', 'ride_hail'),
  ('taxi_airport', 'Airport Taxi (Yellow)', 'taxi'),
  ('ferry_pasig', 'Pasig River Ferry', 'ferry')
ON CONFLICT (slug) DO NOTHING;

-- Places (canonical origins/destinations)
CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  aliases TEXT[] DEFAULT '{}',
  geom GEOGRAPHY(POINT) NOT NULL,
  nominatim_osm_id BIGINT,
  geocode_confidence REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS places_geom_idx ON places USING GIST (geom);
CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON places USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS places_aliases_idx ON places USING GIN (aliases);

-- Geocode cache (Nominatim)
CREATE TABLE IF NOT EXISTS geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT UNIQUE NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  raw_json JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transit lines (corridor / route name + geometry)
-- station_sequence: ordered stop names for rail/ferry (parsed from "A -> B -> C" in spreadsheet)
CREATE TABLE IF NOT EXISTS transit_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_id UUID NOT NULL REFERENCES transport_modes(id),
  name TEXT NOT NULL,
  description TEXT,
  station_sequence TEXT[] DEFAULT '{}',
  path GEOGRAPHY(LINESTRING),
  osm_way_ids BIGINT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mode_id, name)
);

CREATE INDEX IF NOT EXISTS transit_lines_path_idx ON transit_lines USING GIST (path);

-- Trip options (one spreadsheet row)
-- distance_km: e.g. 12.0, 17.5
-- earliest_travel_time / last_travel_time: free text, e.g. "6:00 AM", "12:00 AM (24/7)", "11:59 PM (24/7)"
-- frequency: e.g. "Every 8-12 min", "On-demand booking (1-10 min ETA)", "Every 30-45 min"
-- operates_24_7: true when schedule text contains "24/7"
CREATE TABLE IF NOT EXISTS trip_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_place_id UUID NOT NULL REFERENCES places(id),
  dest_place_id UUID NOT NULL REFERENCES places(id),
  transit_line_id UUID NOT NULL REFERENCES transit_lines(id),
  fare_regular NUMERIC(10,2) NOT NULL,
  fare_discounted NUMERIC(10,2) NOT NULL,
  distance_km NUMERIC(8,2),
  earliest_travel_time TEXT,
  last_travel_time TEXT,
  frequency TEXT,
  operates_24_7 BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'spreadsheet',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (origin_place_id, dest_place_id, transit_line_id)
);

CREATE INDEX IF NOT EXISTS trip_options_od_idx ON trip_options (origin_place_id, dest_place_id);
CREATE INDEX IF NOT EXISTS trip_options_active_idx ON trip_options (is_active) WHERE is_active = TRUE;

-- Line stops (boarding / alighting)
CREATE TABLE IF NOT EXISTS line_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transit_line_id UUID NOT NULL REFERENCES transit_lines(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id),
  geom GEOGRAPHY(POINT),
  sequence INT NOT NULL,
  stop_role TEXT NOT NULL CHECK (stop_role IN ('board', 'alight', 'via')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS line_stops_line_idx ON line_stops (transit_line_id, sequence);
CREATE INDEX IF NOT EXISTS line_stops_geom_idx ON line_stops USING GIST (geom);

-- Search trip options by coordinates (nearest places within radius)
CREATE OR REPLACE FUNCTION search_trip_options(
  origin_lng DOUBLE PRECISION,
  origin_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  radius_m DOUBLE PRECISION DEFAULT 2000
)
RETURNS TABLE (
  id UUID,
  origin_name TEXT,
  dest_name TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  mode_slug TEXT,
  mode_label TEXT,
  mode_category TEXT,
  line_name TEXT,
  line_description TEXT,
  fare_regular NUMERIC,
  fare_discounted NUMERIC,
  distance_km NUMERIC,
  earliest_travel_time TEXT,
  last_travel_time TEXT,
  frequency TEXT,
  operates_24_7 BOOLEAN,
  station_sequence TEXT[],
  source TEXT,
  path_geojson JSONB,
  board_lat DOUBLE PRECISION,
  board_lng DOUBLE PRECISION,
  origin_distance_m DOUBLE PRECISION,
  dest_distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  WITH origin_pt AS (
    SELECT ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)::geography AS g
  ),
  dest_pt AS (
    SELECT ST_SetSRID(ST_MakePoint(dest_lng, dest_lat), 4326)::geography AS g
  ),
  nearest_origin AS (
    SELECT p.id, p.name,
      ST_Y(p.geom::geometry) AS lat,
      ST_X(p.geom::geometry) AS lng,
      ST_Distance(p.geom, (SELECT g FROM origin_pt)) AS dist_m
    FROM places p, origin_pt o
    WHERE ST_DWithin(p.geom, o.g, radius_m)
    ORDER BY dist_m
    LIMIT 5
  ),
  nearest_dest AS (
    SELECT p.id, p.name,
      ST_Y(p.geom::geometry) AS lat,
      ST_X(p.geom::geometry) AS lng,
      ST_Distance(p.geom, (SELECT g FROM dest_pt)) AS dist_m
    FROM places p, dest_pt d
    WHERE ST_DWithin(p.geom, d.g, radius_m)
    ORDER BY dist_m
    LIMIT 5
  ),
  matches AS (
    SELECT DISTINCT ON (t.id)
      t.id,
      op.name AS origin_name,
      dp.name AS dest_name,
      op.lat AS origin_lat,
      op.lng AS origin_lng,
      dp.lat AS dest_lat,
      dp.lng AS dest_lng,
      tm.slug AS mode_slug,
      tm.label AS mode_label,
      tm.category AS mode_category,
      tl.name AS line_name,
      tl.description AS line_description,
      t.fare_regular,
      t.fare_discounted,
      t.distance_km,
      t.earliest_travel_time,
      t.last_travel_time,
      t.frequency,
      t.operates_24_7,
      tl.station_sequence,
      t.source,
      CASE
        WHEN tl.path IS NOT NULL THEN ST_AsGeoJSON(tl.path::geometry)::jsonb
        ELSE NULL
      END AS path_geojson,
      COALESCE(
        ST_Y(ls.geom::geometry),
        op.lat
      ) AS board_lat,
      COALESCE(
        ST_X(ls.geom::geometry),
        op.lng
      ) AS board_lng,
      op.dist_m AS origin_distance_m,
      dp.dist_m AS dest_distance_m
    FROM trip_options t
    JOIN nearest_origin op ON t.origin_place_id = op.id
    JOIN nearest_dest dp ON t.dest_place_id = dp.id
    JOIN transit_lines tl ON t.transit_line_id = tl.id
    JOIN transport_modes tm ON tl.mode_id = tm.id
    LEFT JOIN LATERAL (
      SELECT ls2.geom
      FROM line_stops ls2
      WHERE ls2.transit_line_id = tl.id AND ls2.stop_role = 'board'
      ORDER BY ls2.sequence
      LIMIT 1
    ) ls ON TRUE
    WHERE t.is_active = TRUE
    ORDER BY t.id, op.dist_m + dp.dist_m
  )
  SELECT * FROM matches
  ORDER BY origin_distance_m + dest_distance_m;
$$;

-- Text fallback search (place names)
CREATE OR REPLACE FUNCTION search_trip_options_by_text(
  origin_text TEXT,
  dest_text TEXT
)
RETURNS TABLE (
  id UUID,
  origin_name TEXT,
  dest_name TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  mode_slug TEXT,
  mode_label TEXT,
  mode_category TEXT,
  line_name TEXT,
  line_description TEXT,
  fare_regular NUMERIC,
  fare_discounted NUMERIC,
  distance_km NUMERIC,
  earliest_travel_time TEXT,
  last_travel_time TEXT,
  frequency TEXT,
  operates_24_7 BOOLEAN,
  station_sequence TEXT[],
  source TEXT,
  path_geojson JSONB,
  board_lat DOUBLE PRECISION,
  board_lng DOUBLE PRECISION,
  origin_distance_m DOUBLE PRECISION,
  dest_distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  WITH origin_places AS (
    SELECT p.id FROM places p
    WHERE p.name ILIKE '%' || origin_text || '%'
       OR origin_text = ANY(p.aliases)
    LIMIT 10
  ),
  dest_places AS (
    SELECT p.id FROM places p
    WHERE p.name ILIKE '%' || dest_text || '%'
       OR dest_text = ANY(p.aliases)
    LIMIT 10
  )
  SELECT
    t.id,
    op.name AS origin_name,
    dp.name AS dest_name,
    ST_Y(op.geom::geometry) AS origin_lat,
    ST_X(op.geom::geometry) AS origin_lng,
    ST_Y(dp.geom::geometry) AS dest_lat,
    ST_X(dp.geom::geometry) AS dest_lng,
    tm.slug AS mode_slug,
    tm.label AS mode_label,
    tm.category AS mode_category,
    tl.name AS line_name,
    tl.description AS line_description,
    t.fare_regular,
    t.fare_discounted,
    t.distance_km,
    t.earliest_travel_time,
    t.last_travel_time,
    t.frequency,
    t.operates_24_7,
    tl.station_sequence,
    t.source,
    CASE WHEN tl.path IS NOT NULL THEN ST_AsGeoJSON(tl.path::geometry)::jsonb ELSE NULL END,
    COALESCE(ST_Y(ls.geom::geometry), ST_Y(op.geom::geometry)),
    COALESCE(ST_X(ls.geom::geometry), ST_X(op.geom::geometry)),
    0::DOUBLE PRECISION,
    0::DOUBLE PRECISION
  FROM trip_options t
  JOIN places op ON t.origin_place_id = op.id
  JOIN places dp ON t.dest_place_id = dp.id
  JOIN transit_lines tl ON t.transit_line_id = tl.id
  JOIN transport_modes tm ON tl.mode_id = tm.id
  LEFT JOIN LATERAL (
    SELECT ls2.geom FROM line_stops ls2
    WHERE ls2.transit_line_id = tl.id AND ls2.stop_role = 'board'
    ORDER BY ls2.sequence LIMIT 1
  ) ls ON TRUE
  WHERE t.is_active = TRUE
    AND (origin_text = '' OR t.origin_place_id IN (SELECT id FROM origin_places))
    AND (dest_text = '' OR t.dest_place_id IN (SELECT id FROM dest_places))
    AND (origin_text <> '' OR dest_text <> '');
$$;

-- RLS
ALTER TABLE transport_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read transport_modes" ON transport_modes FOR SELECT USING (true);
CREATE POLICY "Public read places" ON places FOR SELECT USING (true);
CREATE POLICY "Public read transit_lines" ON transit_lines FOR SELECT USING (true);
CREATE POLICY "Public read trip_options" ON trip_options FOR SELECT USING (true);
CREATE POLICY "Public read line_stops" ON line_stops FOR SELECT USING (true);

GRANT SELECT ON transport_modes, places, transit_lines, trip_options, line_stops TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_trip_options TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_trip_options_by_text TO anon, authenticated;
