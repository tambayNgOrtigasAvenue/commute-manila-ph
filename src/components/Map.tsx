'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix for default marker icons in Leaflet with Next.js
const icon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ManilaCenter: [number, number] = [14.5995, 120.9842];

export default function Map() {
  useEffect(() => {
    // This is to fix an issue where the map doesn't resize correctly on initial load
    window.dispatchEvent(new Event('resize'));
  }, []);

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
      <Marker position={ManilaCenter} icon={icon}>
        <Popup>
          Manila Center
        </Popup>
      </Marker>
    </MapContainer>
  );
}
