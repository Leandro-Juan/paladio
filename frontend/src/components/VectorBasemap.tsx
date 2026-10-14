"use client";

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Ensure MapLibre worker is loaded correctly from local public bundle
if (typeof window !== 'undefined') {
  setWorkerUrl('/worker/maplibre-gl-worker.mjs');
}

interface VectorBasemapProps {
  styleUrl?: string;
}

export function VectorBasemap({
  styleUrl = 'https://tiles.openfreemap.org/styles/liberty',
}: VectorBasemapProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initLayer() {
      try {
        await import('@maplibre/maplibre-gl-leaflet');

        const res = await fetch(styleUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch map style from ${styleUrl}`);
        }
        const style = await res.json();

        // Strip out amenity icons, shop icons, bus icons, and cluttered POI layers,
        // as well as 3D building extrusions/shadows for a 100% plain 2D architectural map
        if (Array.isArray(style.layers)) {
          style.layers = style.layers.filter((l: { type?: string; layout?: { 'icon-image'?: unknown }; id?: string }) => {
            const id = l.id || '';
            if (
              l.type === 'symbol' &&
              (l.layout?.['icon-image'] ||
                id.includes('poi') ||
                id.includes('transit') ||
                id.includes('bus') ||
                id.includes('station'))
            ) {
              return false;
            }
            // Remove 3D building extrusions and elevation shadows
            if (id === 'building-3d' || l.type === 'fill-extrusion' || id.includes('3d') || id.includes('extrusion')) {
              return false;
            }
            return true;
          });

          // Ensure the clean 2D flat building footprints remain active across all high zoom tiers
          const flatBuilding = style.layers.find((l: { id?: string; maxzoom?: number }) => l.id === 'building');
          if (flatBuilding) {
            delete flatBuilding.maxzoom;
          }
        }

        if (isCancelled) return;

        if (typeof L.maplibreGL === 'function') {
          const layer = L.maplibreGL({
            style,
            maxZoom: 19,
          });

          layerRef.current = layer;
          layer.addTo(map);
        }
      } catch (err) {
        console.warn('Vector basemap initialization failed:', err);
      }
    }

    initLayer();

    return () => {
      isCancelled = true;
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, styleUrl]);

  return null;
}
