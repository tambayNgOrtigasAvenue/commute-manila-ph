'use client';

import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

/** Renders children only after Leaflet map panes exist (prevents appendChild errors). */
export default function MapWhenReady({ children }: { children: React.ReactNode }) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const activate = () => {
      const container = map.getContainer?.();
      if (!cancelled && container?.isConnected) {
        setReady(true);
      }
    };

    const leafletMap = map as LeafletMap & { _loaded?: boolean };
    if (leafletMap._loaded) {
      activate();
    } else {
      map.whenReady(activate);
    }

    return () => {
      cancelled = true;
      setReady(false);
    };
  }, [map]);

  if (!ready) return null;
  return <>{children}</>;
}
