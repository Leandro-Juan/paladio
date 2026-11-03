import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { apiFetch } from '@/utils/api';

export interface CollectionPoiSummary {
  id: string;
  name: string;
  category?: string;
  cost_eur?: number;
  duration_mins?: number;
  lat?: number | null;
  lng?: number | null;
  photo_url?: string | null;
  thumbnail_url?: string | null;
  rating?: number | null;
  formatted_address?: string | null;
  description?: string | null;
}

export interface CollectionItem {
  id: string;
  collection_id: string;
  poi_id: string;
  notes?: string | null;
  order_index: number;
  created_at: string;
  poi?: CollectionPoiSummary | null;
}

export interface TripCollection {
  id: string;
  trip_id: string;
  trip_destination?: string | null;
  trip_title?: string | null;
  name: string;
  description?: string | null;
  color?: string;
  created_at: string;
  updated_at: string;
  items_count: number;
  items: CollectionItem[];
}

interface ToggleResponse {
  poi_id: string;
  collection_id: string;
  saved: boolean;
  collection_ids: string[];
}

const EMPTY_COLLECTIONS: TripCollection[] = [];

// Global cache and listener registry to synchronize multiple components for the same trip
const collectionsCache = new Map<string, TripCollection[]>();
const listeners = new Map<string, Set<() => void>>();

function notifyListeners(tripId: string) {
  const set = listeners.get(tripId);
  if (set) {
    set.forEach((fn) => fn());
  }
}

function subscribeToTrip(tripId: string, callback: () => void) {
  if (!listeners.has(tripId)) {
    listeners.set(tripId, new Set());
  }
  listeners.get(tripId)!.add(callback);
  return () => {
    listeners.get(tripId)?.delete(callback);
  };
}

export function useTripCollections(tripId?: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!tripId) return () => {};
      return subscribeToTrip(tripId, onStoreChange);
    },
    [tripId]
  );

  const getSnapshot = useCallback(() => {
    if (!tripId) return EMPTY_COLLECTIONS;
    return collectionsCache.get(tripId) || EMPTY_COLLECTIONS;
  }, [tripId]);

  const collections = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_COLLECTIONS);

  const [loading, setLoading] = useState<boolean>(!tripId || !collectionsCache.has(tripId));
  const [error, setError] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await apiFetch<TripCollection[]>(`/trips/${tripId}/collections`);
      collectionsCache.set(tripId, data);
      notifyListeners(tripId);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch collections';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    let isMounted = true;
    (async () => {
      try {
        const data = await apiFetch<TripCollection[]>(`/trips/${tripId}/collections`);
        if (!isMounted) return;
        collectionsCache.set(tripId, data);
        notifyListeners(tripId);
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch collections';
        setError(msg);
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [tripId]);

  // Create a new collection
  const createCollection = useCallback(
    async (name: string, description?: string, color: string = '#0F4C5C'): Promise<TripCollection | null> => {
      if (!tripId) return null;
      try {
        const created = await apiFetch<TripCollection>(`/trips/${tripId}/collections`, {
          method: 'POST',
          body: JSON.stringify({ name, description, color }),
        });
        const current = collectionsCache.get(tripId) || [];
        const next = [...current, created];
        collectionsCache.set(tripId, next);
        notifyListeners(tripId);
        return created;
      } catch (err: unknown) {
        console.error('Failed to create collection:', err);
        throw err;
      }
    },
    [tripId]
  );

  // Update a collection
  const updateCollection = useCallback(
    async (
      collectionId: string,
      updates: { name?: string; description?: string; color?: string }
    ): Promise<TripCollection | null> => {
      if (!tripId) return null;
      try {
        const updated = await apiFetch<TripCollection>(`/trips/${tripId}/collections/${collectionId}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        const current = collectionsCache.get(tripId) || [];
        const next = current.map((c) => (c.id === collectionId ? updated : c));
        collectionsCache.set(tripId, next);
        notifyListeners(tripId);
        return updated;
      } catch (err: unknown) {
        console.error('Failed to update collection:', err);
        throw err;
      }
    },
    [tripId]
  );

  // Delete a collection
  const deleteCollection = useCallback(
    async (collectionId: string): Promise<boolean> => {
      if (!tripId) return false;
      try {
        await apiFetch(`/trips/${tripId}/collections/${collectionId}`, {
          method: 'DELETE',
        });
        const current = collectionsCache.get(tripId) || [];
        const next = current.filter((c) => c.id !== collectionId);
        collectionsCache.set(tripId, next);
        notifyListeners(tripId);
        return true;
      } catch (err: unknown) {
        console.error('Failed to delete collection:', err);
        throw err;
      }
    },
    [tripId]
  );

  // Toggle POI membership in a collection
  const togglePoiInCollection = useCallback(
    async (collectionId: string, poiId: string, poiDetails?: CollectionPoiSummary): Promise<boolean> => {
      if (!tripId) return false;
      try {
        const res = await apiFetch<ToggleResponse>(`/trips/${tripId}/pois/${poiId}/toggle`, {
          method: 'POST',
          body: JSON.stringify({ collection_id: collectionId }),
        });

        // Synchronously update collection items
        const current = collectionsCache.get(tripId) || [];
        const next = current.map((col) => {
          if (col.id !== collectionId) return col;

          if (res.saved) {
            const alreadyHas = col.items.some((it) => it.poi_id === poiId);
            if (alreadyHas) return col;
            const newItem: CollectionItem = {
              id: `temp-${Date.now()}`,
              collection_id: collectionId,
              poi_id: poiId,
              notes: null,
              order_index: col.items.length,
              created_at: new Date().toISOString(),
              poi: poiDetails || null,
            };
            return {
              ...col,
              items_count: col.items_count + 1,
              items: [...col.items, newItem],
            };
          } else {
            return {
              ...col,
              items_count: Math.max(0, col.items_count - 1),
              items: col.items.filter((it) => it.poi_id !== poiId),
            };
          }
        });

        collectionsCache.set(tripId, next);
        notifyListeners(tripId);

        // Background re-fetch to ensure fresh server hydration
        fetchCollections();

        return res.saved;
      } catch (err: unknown) {
        console.error('Failed to toggle POI in collection:', err);
        throw err;
      }
    },
    [tripId, fetchCollections]
  );

  // Remove item from a collection
  const removeItemFromCollection = useCallback(
    async (collectionId: string, poiId: string): Promise<boolean> => {
      if (!tripId) return false;
      try {
        await apiFetch(`/trips/${tripId}/collections/${collectionId}/items/${poiId}`, {
          method: 'DELETE',
        });
        const current = collectionsCache.get(tripId) || [];
        const next = current.map((col) => {
          if (col.id !== collectionId) return col;
          return {
            ...col,
            items_count: Math.max(0, col.items_count - 1),
            items: col.items.filter((it) => it.poi_id !== poiId),
          };
        });
        collectionsCache.set(tripId, next);
        notifyListeners(tripId);
        return true;
      } catch (err: unknown) {
        console.error('Failed to remove item from collection:', err);
        throw err;
      }
    },
    [tripId]
  );

  // Helper: Get collection IDs containing a POI
  const getPoiCollectionIds = useCallback(
    (poiId: string): string[] => {
      return collections
        .filter((col) => col.items.some((it) => it.poi_id === poiId))
        .map((col) => col.id);
    },
    [collections]
  );

  // Helper: Is a POI saved in ANY collection?
  const isPoiSaved = useCallback(
    (poiId: string): boolean => {
      return collections.some((col) => col.items.some((it) => it.poi_id === poiId));
    },
    [collections]
  );

  // Map of poiId -> Set of collection IDs for fast O(1) checks
  const poiCollectionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const col of collections) {
      for (const item of col.items) {
        if (!map.has(item.poi_id)) {
          map.set(item.poi_id, new Set());
        }
        map.get(item.poi_id)!.add(col.id);
      }
    }
    return map;
  }, [collections]);

  return {
    collections,
    loading,
    error,
    refreshCollections: fetchCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    togglePoiInCollection,
    removeItemFromCollection,
    getPoiCollectionIds,
    isPoiSaved,
    poiCollectionMap,
  };
}

export function useSavedCollections() {
  const [collections, setCollections] = useState<TripCollection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<TripCollection[]>('/trips/saved-collections');
      setCollections(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch saved collections';
      setError(msg);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await apiFetch<TripCollection[]>('/trips/saved-collections');
        if (!isMounted) return;
        setCollections(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch saved collections';
        setError(msg);
        setCollections([]);
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    collections,
    loading,
    error,
    refresh,
  };
}

