'use client';

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Fix for default marker icons in Leaflet
// This delete/merge trick forces Leaflet to stop looking for local files
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

const createIcon = (color: string) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const icons = {
  terminal: createIcon('blue'),
  station: createIcon('blue'),
  jeepney_hub: createIcon('blue'),
  user: createIcon('red')
};

const ManilaCenter: [number, number] = [14.5995, 120.9842];

interface MapProps {
  showTerminals: boolean;
  showBoundaries: boolean;
  showHighways: boolean;
  showBarangays: boolean;
}

export default function Map({ showTerminals, showBoundaries, showHighways }: MapProps) {
  const [locations, setLocations] = useState<any[]>([]);
  const [boundaries, setBoundaries] = useState<any>(null);

  useEffect(() => {
    // Resize fix
    window.dispatchEvent(new Event('resize'));
    
    if (showTerminals) {
      fetchTerminals();
    } else {
      setLocations([]);
    }

    if (showBoundaries && !boundaries) {
      fetchBoundaries();
    }
  }, [showTerminals, showBoundaries]);

  const fetchTerminals = async () => {
    // change this into fetching api response later
    const { data, error } = await supabase
      .from('locations')
      .select('name, type, coordinates');
    
    if (data) {
      const parsed = data.map(loc => {
        try {
          if (!loc.coordinates || typeof loc.coordinates !== 'string') return null;
          const match = loc.coordinates.match(/POINT\(([-\d.]+) ([\d.]+)\)/);
          if (!match) return null;
          const lng = parseFloat(match[1]);
          const lat = parseFloat(match[2]);
          if (isNaN(lat) || isNaN(lng)) return null;
          return { ...loc, lat, lng };
        } catch (e) {
          return null;
        }
      }).filter(loc => loc !== null);
      setLocations(parsed);
    }
  };

  const fetchBoundaries = async () => {
    try {
      // Request level 6 (Cities) which matches the OSM admin_level in the seeded data
      const res = await fetch('/api/boundaries?level=6');

      if (!res.ok) {
        throw new Error(`Failed to fetch boundaries: ${res.status}`);
      }

      const data = await res.json();
      setBoundaries(data);
    } catch (e) {
      console.error("Failed to fetch boundaries:", e);
    }
  };

  const fetchBarangays = async () => {
    try{
      
    } catch (error){
      console.error("Failed to fetch boundaries:", error);
    }
    const res = await fetch('/api/boundaries?level=10');
    
    if (!res.ok) {
      throw new Error(`Failed to fetch boundaries: ${res.status}`);
    }

    const data = await res.json();
    setBoundaries(data);
  }

  return (
    <MapContainer 
      center={ManilaCenter} 
      zoom={12} 
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {showBoundaries && boundaries && (
        <GeoJSON 
          data={boundaries} 
          filter={(feature) => {
            // ONLY show Polygons/MultiPolygons for boundaries
            // This hides the pins if the data contains points
            return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
          }}
          style={{
            color: '#2563eb', // Blue-600
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            dashArray: '5, 5' // Makes it a dashed line
          }} 
          onEachFeature={(feature, layer) => {
            if (feature.properties && feature.properties.name) {
              layer.bindPopup(`<b class="font-space">${feature.properties.name}</b>`);
            }
          }}
        />
      )}

      {showTerminals && locations.map((loc, idx) => (
        loc.lat && loc.lng && !isNaN(loc.lat) && !isNaN(loc.lng) ? (
          <Marker 
            key={idx} 
            position={[loc.lat, loc.lng]} 
            icon={(icons as any)[loc.type] || icons.terminal}
          >
            <Popup>
              <div className="p-1">
                <p className="font-bold text-sm">{loc.name}</p>
                <p className="text-xs uppercase text-blue-600">{loc.type.replace('_', ' ')}</p>
              </div>
            </Popup>
          </Marker>
        ) : null
      ))}

      {showHighways && (
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.5}
        />
      )}
    </MapContainer>
  );
}
