'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';

export default function MapFitBounds({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length < 1) return;

    const container = map.getContainer?.();
    if (!container?.isConnected) return;

    try {
      if (positions.length === 1) {
        map.setView(positions[0], 15);
        return;
      }
      map.fitBounds(positions, { padding: [48, 48] });
    } catch {
      // Map was torn down during React strict-mode remount
    }
  }, [map, positions]);

  return null;
}
