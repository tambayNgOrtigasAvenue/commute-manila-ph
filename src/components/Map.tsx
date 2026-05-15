'use client';

import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useMemo, useId } from 'react';
import { supabase } from '@/lib/supabase';
import MapFitBounds from './MapFitBounds';
import type { TripOption } from '@/lib/routing';
import { pathLooksLikeStraightLine, pathToLatLngs } from '@/lib/routeGeometry';

if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

const createIcon = (color: string) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const icons = {
  terminal: createIcon('blue'),
  station: createIcon('blue'),
  jeepney_hub: createIcon('blue'),
  origin: createIcon('green'),
  destination: createIcon('red'),
  user: createIcon('orange'),
  board: createIcon('blue'),
};

const ManilaCenter: [number, number] = [14.5995, 120.9842];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapSelection {
  trip: TripOption;
  /** GPS position only — not geocoded search text */
  userGps?: MapPoint;
  /** Where the user's search text resolved on the map */
  searchOrigin?: MapPoint;
  searchDestination?: MapPoint;
}

interface MapProps {
  showTerminals: boolean;
  showBoundaries: boolean;
  showHighways: boolean;
  selection?: MapSelection | null;
}

function MapPlaceholder() {
  return (
    <div className="h-full w-full min-h-[200px] bg-surface-container-low animate-pulse flex items-center justify-center text-outline font-space">
      Loading map…
    </div>
  );
}

function CommuteMapLayers({
  showTerminals,
  showBoundaries,
  showHighways,
  selection,
}: MapProps) {
  const [locations, setLocations] = useState<
    { name: string; type: string; lat: number; lng: number }[]
  >([]);
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(null);
  const [roadPath, setRoadPath] = useState<[number, number][]>([]);

  useEffect(() => {
    if (showTerminals) {
      fetchTerminals();
    } else {
      setLocations([]);
    }
  }, [showTerminals]);

  useEffect(() => {
    if (showBoundaries) {
      fetchBoundaries();
    } else {
      setBoundaries(null);
    }
  }, [showBoundaries]);

  const fetchTerminals = async () => {
    const { data } = await supabase.from('locations').select('name, type, coordinates');

    if (data) {
      const parsed = data
        .map((loc) => {
          try {
            if (!loc.coordinates || typeof loc.coordinates !== 'string') return null;
            const match = loc.coordinates.match(/POINT\(([-\d.]+) ([\d.]+)\)/);
            if (!match) return null;
            const lng = parseFloat(match[1]);
            const lat = parseFloat(match[2]);
            if (isNaN(lat) || isNaN(lng)) return null;
            return { ...loc, lat, lng };
          } catch {
            return null;
          }
        })
        .filter((loc) => loc !== null) as { name: string; type: string; lat: number; lng: number }[];
      setLocations(parsed);
    }
  };

  const fetchBoundaries = async () => {
    try {
      const res = await fetch('/api/boundaries?level=6');
      if (!res.ok) throw new Error(`Failed to fetch boundaries: ${res.status}`);
      const data = await res.json();
      setBoundaries(data as GeoJSON.FeatureCollection);
    } catch (e) {
      console.error('Failed to fetch boundaries:', e);
    }
  };

  const storedPath = useMemo(() => {
    if (!selection?.trip) return [] as [number, number][];
    return pathToLatLngs(selection.trip.pathGeojson);
  }, [selection]);

  useEffect(() => {
    const trip = selection?.trip;
    if (!trip?.originLat || !trip?.destLat) {
      setRoadPath([]);
      return;
    }

    const fallback: [number, number][] =
      storedPath.length >= 2
        ? storedPath
        : [
            [trip.originLat, trip.originLng],
            [trip.destLat, trip.destLng],
          ];

    if (storedPath.length > 2 && !pathLooksLikeStraightLine(storedPath)) {
      setRoadPath(storedPath);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      olat: String(trip.originLat),
      olng: String(trip.originLng),
      dlat: String(trip.destLat),
      dlng: String(trip.destLng),
    });

    fetch(`/api/trips/geometry?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.coordinates?.length >= 2) {
          setRoadPath(data.coordinates);
        } else {
          setRoadPath(fallback);
        }
      })
      .catch(() => {
        if (!cancelled) setRoadPath(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [selection, storedPath]);

  const transitPositions = roadPath;

  const walkPositions = useMemo((): [number, number][] => {
    const walk = selection?.trip.walkLeg;
    if (!walk) return [];
    return [walk.from, walk.to];
  }, [selection]);

  const fitPositions = useMemo((): [number, number][] => {
    const trip = selection?.trip;
    const pts: [number, number][] = [];
    if (trip?.originLat && trip?.originLng) {
      pts.push([trip.originLat, trip.originLng]);
    }
    if (trip?.destLat && trip?.destLng) {
      pts.push([trip.destLat, trip.destLng]);
    }
    pts.push(...transitPositions);
    pts.push(...walkPositions);
    if (selection?.searchOrigin) {
      pts.push([selection.searchOrigin.lat, selection.searchOrigin.lng]);
    }
    if (selection?.searchDestination) {
      pts.push([selection.searchDestination.lat, selection.searchDestination.lng]);
    }
    if (selection?.userGps) {
      pts.push([selection.userGps.lat, selection.userGps.lng]);
    }
    return pts;
  }, [selection, transitPositions, walkPositions]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={showHighways ? 0.55 : 1}
      />

      {fitPositions.length > 0 && <MapFitBounds positions={fitPositions} />}

      {showBoundaries && boundaries && (
        <GeoJSON
          key="boundaries"
          data={boundaries}
          filter={(feature) =>
            feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
          }
          style={{
            color: '#2563eb',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            dashArray: '5, 5',
          }}
          onEachFeature={(feature, layer) => {
            if (feature.properties?.name) {
              layer.bindPopup(`<b class="font-space">${feature.properties.name}</b>`);
            }
          }}
        />
      )}

      {showTerminals &&
        locations.map((loc) =>
          loc.lat && loc.lng ? (
            <Marker
              key={`${loc.name}-${loc.lat}-${loc.lng}`}
              position={[loc.lat, loc.lng]}
              icon={icons[loc.type as keyof typeof icons] || icons.terminal}
            >
              <Popup>
                <div className="p-1">
                  <p className="font-bold text-sm">{loc.name}</p>
                  <p className="text-xs uppercase text-blue-600">{loc.type.replace('_', ' ')}</p>
                </div>
              </Popup>
            </Marker>
          ) : null
        )}

      {selection?.trip.originLat && selection?.trip.originLng && (
        <Marker
          position={[selection.trip.originLat, selection.trip.originLng]}
          icon={icons.origin}
        >
          <Popup>
            <p className="text-sm font-bold">Route start</p>
            <p className="text-xs">{selection.trip.originName}</p>
          </Popup>
        </Marker>
      )}

      {selection?.trip.destLat && selection?.trip.destLng && (
        <Marker
          position={[selection.trip.destLat, selection.trip.destLng]}
          icon={icons.destination}
        >
          <Popup>
            <p className="text-sm font-bold">Route end</p>
            <p className="text-xs">{selection.trip.destName}</p>
          </Popup>
        </Marker>
      )}

      {selection?.searchOrigin &&
        selection.trip.originLat &&
        haversineKm(
          selection.searchOrigin.lat,
          selection.searchOrigin.lng,
          selection.trip.originLat,
          selection.trip.originLng
        ) > 0.5 && (
          <Marker
            position={[selection.searchOrigin.lat, selection.searchOrigin.lng]}
            icon={icons.user}
          >
            <Popup>
              <p className="text-sm font-bold">You searched for</p>
              <p className="text-xs">{selection.searchOrigin.label || 'Origin'}</p>
            </Popup>
          </Marker>
        )}

      {selection?.searchDestination &&
        selection.trip.destLat &&
        haversineKm(
          selection.searchDestination.lat,
          selection.searchDestination.lng,
          selection.trip.destLat,
          selection.trip.destLng
        ) > 0.5 && (
          <Marker
            position={[selection.searchDestination.lat, selection.searchDestination.lng]}
            icon={icons.user}
          >
            <Popup>
              <p className="text-sm font-bold">You searched for</p>
              <p className="text-xs">{selection.searchDestination.label || 'Destination'}</p>
            </Popup>
          </Marker>
        )}

      {selection?.userGps && (
        <Marker position={[selection.userGps.lat, selection.userGps.lng]} icon={icons.user}>
          <Popup>
            <p className="text-sm font-bold">Your GPS location</p>
          </Popup>
        </Marker>
      )}

      {selection?.trip.walkLeg && selection.trip.boardLat && selection.trip.boardLng && (
        <Marker position={[selection.trip.boardLat, selection.trip.boardLng]} icon={icons.board}>
          <Popup>
            <p className="text-sm font-bold">Board here</p>
            <p className="text-xs">{selection.trip.lineName}</p>
          </Popup>
        </Marker>
      )}

      {transitPositions.length >= 2 && (
        <Polyline
          positions={transitPositions}
          pathOptions={{ color: '#1d4ed8', weight: 5, opacity: 0.9 }}
        />
      )}

      {walkPositions.length === 2 && (
        <Polyline
          positions={walkPositions}
          pathOptions={{
            color: '#64748b',
            weight: 4,
            opacity: 0.85,
            dashArray: '8, 12',
          }}
        />
      )}
    </>
  );
}

export default function Map(props: MapProps) {
  const mapInstanceId = useId();
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const frame = requestAnimationFrame(() => {
      if (!cancelled) setMapReady(true);
    });

    return () => {
      cancelled = true;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    return () => window.clearTimeout(t);
  }, [mapReady]);

  if (!mapReady) {
    return <MapPlaceholder />;
  }

  return (
    <div className="h-full w-full min-h-[200px]">
      <MapContainer
        key={mapInstanceId}
        center={ManilaCenter}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <CommuteMapLayers {...props} />
      </MapContainer>
    </div>
  );
}
