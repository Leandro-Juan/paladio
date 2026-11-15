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
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
}

export type CollectionItemVisitStatus = 'want_to_go' | 'visited';

export interface CollectionItem {
  id: string;
  collection_id: string;
  poi_id: string;
  notes?: string | null;
  visit_status?: CollectionItemVisitStatus;
  order_index: number;
  created_at: string;
  poi?: CollectionPoiSummary | null;
}

export interface TripCollection {
  id: string;
  trip_id: string | null;
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

// Global shared cache and listener registry across all trips and dashboard
let sharedCollectionsCache: TripCollection[] | null = null;
const sharedListeners = new Set<() => void>();

function notifyAllListeners() {
  sharedListeners.forEach((fn) => fn());
}

function subscribeToSharedCollections(callback: () => void) {
  sharedListeners.add(callback);
  return () => {
    sharedListeners.delete(callback);
  };
}

export function useTripCollections(tripId?: string) {
  const getSnapshot = useCallback(() => {
    return sharedCollectionsCache || EMPTY_COLLECTIONS;
  }, []);

  const collections = useSyncExternalStore(subscribeToSharedCollections, getSnapshot, () => EMPTY_COLLECTIONS);

  const [loading, setLoading] = useState<boolean>(sharedCollectionsCache === null);
  const [error, setError] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    const url = tripId ? `/trips/${tripId}/collections` : '/trips/saved-collections';
    try {
      const data = await apiFetch<TripCollection[]>(url);
      sharedCollectionsCache = Array.isArray(data) ? data : [];
      notifyAllListeners();
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch collections';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const url = tripId ? `/trips/${tripId}/collections` : '/trips/saved-collections';
      try {
        const data = await apiFetch<TripCollection[]>(url);
        if (!isMounted) return;
        sharedCollectionsCache = Array.isArray(data) ? data : [];
        notifyAllListeners();
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
        const current = sharedCollectionsCache || [];
        sharedCollectionsCache = [...current, created];
        notifyAllListeners();
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
        const current = sharedCollectionsCache || [];
        sharedCollectionsCache = current.map((c) => (c.id === collectionId ? updated : c));
        notifyAllListeners();
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
        const current = sharedCollectionsCache || [];
        sharedCollectionsCache = current.filter((c) => c.id !== collectionId);
        notifyAllListeners();
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
        const current = sharedCollectionsCache || [];
        sharedCollectionsCache = current.map((col) => {
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

        notifyAllListeners();

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

  // Update item visit status ('want_to_go' | 'visited')
  const updateItemVisitStatus = useCallback(
    async (collectionId: string, poiId: string, visitStatus: CollectionItemVisitStatus): Promise<boolean> => {
      if (!tripId) return false;
      const previous = sharedCollectionsCache;
      sharedCollectionsCache = (previous || []).map((col) => {
        if (col.id !== collectionId) return col;
        return {
          ...col,
          items: col.items.map((it) =>
            it.poi_id === poiId ? { ...it, visit_status: visitStatus } : it
          ),
        };
      });
      notifyAllListeners();

      try {
        await apiFetch<CollectionItem>(`/trips/${tripId}/collections/${collectionId}/items/${poiId}`, {
          method: 'PATCH',
          body: JSON.stringify({ visit_status: visitStatus }),
        });
        return true;
      } catch (err: unknown) {
        sharedCollectionsCache = previous;
        notifyAllListeners();
        console.error('Failed to update item visit status:', err);
        throw err;
      }
    },
    [tripId]
  );

  // Remove item from a collection
  const removeItemFromCollection = useCallback(
    async (collectionId: string, poiId: string): Promise<boolean> => {
      if (!tripId) return false;
      try {
        await apiFetch(`/trips/${tripId}/collections/${collectionId}/items/${poiId}`, {
          method: 'DELETE',
        });
        const current = sharedCollectionsCache || [];
        sharedCollectionsCache = current.map((col) => {
          if (col.id !== collectionId) return col;
          return {
            ...col,
            items_count: Math.max(0, col.items_count - 1),
            items: col.items.filter((it) => it.poi_id !== poiId),
          };
        });
        notifyAllListeners();
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
    updateItemVisitStatus,
    getPoiCollectionIds,
    isPoiSaved,
    poiCollectionMap,
  };
}

export function useSavedCollections() {
  const getSnapshot = useCallback(() => {
    return sharedCollectionsCache || EMPTY_COLLECTIONS;
  }, []);

  const collections = useSyncExternalStore(subscribeToSharedCollections, getSnapshot, () => EMPTY_COLLECTIONS);
  const [loading, setLoading] = useState<boolean>(sharedCollectionsCache === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<TripCollection[]>('/trips/saved-collections');
      sharedCollectionsCache = Array.isArray(data) ? data : [];
      notifyAllListeners();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch saved collections';
      setError(msg);
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
        sharedCollectionsCache = Array.isArray(data) ? data : [];
        notifyAllListeners();
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch saved collections';
        setError(msg);
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const createCollection = useCallback(
    async (name: string, description?: string, color: string = '#0F4C5C'): Promise<TripCollection | null> => {
      const created = await apiFetch<TripCollection>('/trips/saved-collections', {
        method: 'POST',
        body: JSON.stringify({ name, description, color }),
      });
      const current = sharedCollectionsCache || [];
      sharedCollectionsCache = [created, ...current];
      notifyAllListeners();
      return created;
    },
    []
  );

  const updateCollection = useCallback(
    async (
      collectionId: string,
      updates: { name?: string; description?: string; color?: string }
    ): Promise<TripCollection | null> => {
      const updated = await apiFetch<TripCollection>(`/trips/saved-collections/${collectionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      const current = sharedCollectionsCache || [];
      sharedCollectionsCache = current.map((c) => (c.id === collectionId ? updated : c));
      notifyAllListeners();
      return updated;
    },
    []
  );

  const deleteCollection = useCallback(async (collectionId: string): Promise<boolean> => {
    await apiFetch(`/trips/saved-collections/${collectionId}`, {
      method: 'DELETE',
    });
    const current = sharedCollectionsCache || [];
    sharedCollectionsCache = current.filter((c) => c.id !== collectionId);
    notifyAllListeners();
    return true;
  }, []);

  const addItemToCollection = useCallback(
    async (
      collectionId: string,
      poiId: string,
      poiDetails?: CollectionPoiSummary
    ): Promise<CollectionItem | null> => {
      const createdItem = await apiFetch<CollectionItem>(
        `/trips/saved-collections/${collectionId}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ poi_id: poiId }),
        }
      );
      const hydratedItem: CollectionItem = {
        ...createdItem,
        poi: createdItem.poi || poiDetails || null,
      };
      const current = sharedCollectionsCache || [];
      sharedCollectionsCache = current.map((col) => {
        if (col.id !== collectionId) return col;
        const exists = col.items.some((it) => it.poi_id === poiId);
        if (exists) {
          return {
            ...col,
            items: col.items.map((it) => (it.poi_id === poiId ? hydratedItem : it)),
          };
        }
        return {
          ...col,
          items_count: col.items_count + 1,
          items: [...col.items, hydratedItem],
        };
      });
      notifyAllListeners();
      return hydratedItem;
    },
    []
  );

  const updateItemVisitStatus = useCallback(
    async (
      collectionId: string,
      poiId: string,
      visitStatus: CollectionItemVisitStatus
    ): Promise<boolean> => {
      const previous = sharedCollectionsCache;
      sharedCollectionsCache = (previous || []).map((col) => {
        if (col.id !== collectionId) return col;
        return {
          ...col,
          items: col.items.map((it) =>
            it.poi_id === poiId ? { ...it, visit_status: visitStatus } : it
          ),
        };
      });
      notifyAllListeners();

      try {
        await apiFetch<CollectionItem>(
          `/trips/saved-collections/${collectionId}/items/${poiId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ visit_status: visitStatus }),
          }
        );
        return true;
      } catch (err: unknown) {
        sharedCollectionsCache = previous;
        notifyAllListeners();
        throw err;
      }
    },
    []
  );

  const removeItemFromCollection = useCallback(
    async (collectionId: string, poiId: string): Promise<boolean> => {
      await apiFetch(`/trips/saved-collections/${collectionId}/items/${poiId}`, {
        method: 'DELETE',
      });
      const current = sharedCollectionsCache || [];
      sharedCollectionsCache = current.map((col) => {
        if (col.id !== collectionId) return col;
        return {
          ...col,
          items_count: Math.max(0, col.items_count - 1),
          items: col.items.filter((it) => it.poi_id !== poiId),
        };
      });
      notifyAllListeners();
      return true;
    },
    []
  );

  return {
    collections,
    loading,
    error,
    refresh,
    createCollection,
    updateCollection,
    deleteCollection,
    addItemToCollection,
    updateItemVisitStatus,
    removeItemFromCollection,
  };
}

