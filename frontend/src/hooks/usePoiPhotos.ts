"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '@/utils/api';

// In-memory global cache across component mounts
const memoryCache: Record<string, string> = {};

// Load session storage cache if in browser
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem('paladio_poi_photos_cache');
    if (stored) {
      Object.assign(memoryCache, JSON.parse(stored));
    }
  } catch {
    // Ignore storage errors
  }
}

function persistCache() {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('paladio_poi_photos_cache', JSON.stringify(memoryCache));
    } catch {
      // Ignore quota errors
    }
  }
}

// Queue for pending batch photo requests
let batchQueue: Array<{ id?: string; name: string; city: string }> = [];
let batchTimeout: NodeJS.Timeout | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

async function flushBatchQueue() {
  if (batchQueue.length === 0) return;

  const currentBatch = [...batchQueue];
  batchQueue = [];
  batchTimeout = null;

  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/pois/batch-photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pois: currentBatch }),
    });

    if (res.ok) {
      const data = await res.json();
      const photos = data.photos || {};
      let updated = false;

      for (const [key, photo] of Object.entries(photos)) {
        if (photo && typeof photo === 'object' && 'thumbnail_url' in photo) {
          const thumb = (photo as { thumbnail_url?: string; url?: string }).thumbnail_url || (photo as { url?: string }).url;
          if (thumb) {
            memoryCache[key] = thumb;
            updated = true;
          }
        }
      }

      if (updated) {
        persistCache();
        notifyListeners();
      }
    }
  } catch (err) {
    console.debug('Failed to flush batch photo queue:', err);
  }
}

export function requestPoiPhoto(poi: { id?: string; name: string; city?: string; photo_url?: string }) {
  const key = poi.id || poi.name;
  if (!key) return;

  if (poi.photo_url) {
    if (!memoryCache[key]) {
      memoryCache[key] = poi.photo_url;
      persistCache();
      notifyListeners();
    }
    return;
  }

  if (memoryCache[key] !== undefined) {
    return;
  }

  // Check if already queued
  const alreadyQueued = batchQueue.some((item) => (item.id && item.id === poi.id) || item.name === poi.name);
  if (!alreadyQueued) {
    batchQueue.push({
      id: poi.id,
      name: poi.name,
      city: poi.city || '',
    });

    if (!batchTimeout) {
      batchTimeout = setTimeout(flushBatchQueue, 60);
    }
  }
}

export function usePoiPhotos(poisToWatch?: Array<{ id?: string; name: string; city?: string; photo_url?: string }>) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!poisToWatch || poisToWatch.length === 0) return;
    poisToWatch.forEach((poi) => {
      if (poi && (poi.id || poi.name)) {
        requestPoiPhoto(poi);
      }
    });
  }, [poisToWatch]);

  const getPhoto = useCallback((idOrName?: string): string | undefined => {
    if (!idOrName) return undefined;
    return memoryCache[idOrName];
  }, []);

  return {
    getPhoto,
    photos: memoryCache,
    requestPhoto: requestPoiPhoto,
  };
}
