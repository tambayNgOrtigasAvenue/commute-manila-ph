-- Looser trip search: token matching, larger radius, partial OD fallback
-- Must DROP first when return type (OUT columns) changed; CREATE OR REPLACE is not enough.

DROP FUNCTION IF EXISTS search_trip_options(double precision, double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS search_trip_options_by_text(text, text);
DROP FUNCTION IF EXISTS search_trip_options_partial(text, text);

CREATE OR REPLACE FUNCTION place_matches_query(place_name TEXT, query TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN query IS NULL OR trim(query) = '' THEN TRUE
    WHEN lower(place_name) LIKE '%' || lower(trim(query)) || '%' THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM regexp_split_to_table(lower(trim(query)), '[,;\s]+') AS tok
      WHERE length(tok) >= 3
        AND lower(place_name) LIKE '%' || tok || '%'
    )
  END;
$$;

-- Shared row shape helper via duplicated SELECT list in each function below

CREATE OR REPLACE FUNCTION search_trip_options(
  origin_lng DOUBLE PRECISION,
  origin_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  radius_m DOUBLE PRECISION DEFAULT 8000
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
    LIMIT 15
  ),
  nearest_dest AS (
    SELECT p.id, p.name,
      ST_Y(p.geom::geometry) AS lat,
      ST_X(p.geom::geometry) AS lng,
      ST_Distance(p.geom, (SELECT g FROM dest_pt)) AS dist_m
    FROM places p, dest_pt d
    WHERE ST_DWithin(p.geom, d.g, radius_m)
    ORDER BY dist_m
    LIMIT 15
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
    no.dist_m AS origin_distance_m,
    nd.dist_m AS dest_distance_m
  FROM trip_options t
  JOIN places op ON t.origin_place_id = op.id
  JOIN places dp ON t.dest_place_id = dp.id
  JOIN nearest_origin no ON no.id = op.id
  JOIN nearest_dest nd ON nd.id = dp.id
  JOIN transit_lines tl ON t.transit_line_id = tl.id
  JOIN transport_modes tm ON tl.mode_id = tm.id
  LEFT JOIN LATERAL (
    SELECT ls2.geom FROM line_stops ls2
    WHERE ls2.transit_line_id = tl.id AND ls2.stop_role = 'board'
    ORDER BY ls2.sequence LIMIT 1
  ) ls ON TRUE
  WHERE t.is_active = TRUE
  ORDER BY no.dist_m + nd.dist_m;
$$;

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
    AND place_matches_query(op.name, origin_text)
    AND place_matches_query(dp.name, dest_text)
    AND (trim(origin_text) <> '' OR trim(dest_text) <> '')
  ORDER BY op.name, dp.name;
$$;

-- When no exact OD pair: trips from matching origins OR to matching destinations
CREATE OR REPLACE FUNCTION search_trip_options_partial(
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
    AND trim(origin_text) <> ''
    AND trim(dest_text) <> ''
    AND (
      (place_matches_query(op.name, origin_text) AND NOT place_matches_query(dp.name, dest_text))
      OR
      (place_matches_query(dp.name, dest_text) AND NOT place_matches_query(op.name, origin_text))
    )
  ORDER BY op.name, dp.name
  LIMIT 25;
$$;

GRANT EXECUTE ON FUNCTION place_matches_query(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_trip_options(double precision, double precision, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_trip_options_by_text(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_trip_options_partial(text, text) TO anon, authenticated;
