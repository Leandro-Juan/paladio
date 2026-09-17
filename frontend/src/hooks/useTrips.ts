import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';
import { isTripCompleted } from '@/utils/tripParser';

export { getApiBaseUrl };

export interface Trip {
  id?: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary_data: unknown;
  created_at?: string;
}

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await apiFetch<Trip[]>('/trips/', { signal: controller.signal });
        setTrips(data);
        setLoading(false);
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch trips", e);
        setLoading(false);
      }
    }
    load();
    return () => {
      controller.abort();
    };
  }, []);

  const fetchTrips = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch<Trip[]>('/trips/', { signal });
      setTrips(data);
    } catch (e: unknown) {
      if (signal?.aborted) return;
      console.error("Failed to fetch trips", e);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const getTrip = useCallback(async (id: string, signal?: AbortSignal): Promise<Trip | null> => {
    try {
      return await apiFetch<Trip>(`/trips/${id}`, { signal });
    } catch (e: unknown) {
      if (signal?.aborted) return null;
      console.error("Failed to fetch trip", e);
    }
    return null;
  }, []);

  const saveTrip = async (tripData: Omit<Trip, 'id' | 'created_at'>) => {
    try {
      const newTrip = await apiFetch<Trip>('/trips/', {
        method: 'POST',
        body: JSON.stringify(tripData),
      });
      setTrips(prev => [...prev, newTrip]);
      return newTrip;
    } catch (e) {
      console.error("Failed to save trip", e);
    }
    return null;
  };

  const deleteTrip = async (id: string) => {
    try {
      await apiFetch(`/trips/${id}`, {
        method: 'DELETE',
      });
      setTrips(prev => prev.filter(t => t.id !== id));
      return true;
    } catch (e) {
      console.error("Failed to delete trip", e);
    }
    return false;
  };

  const completedTrips = useMemo(() => trips.filter(t => isTripCompleted(t)), [trips]);
  const upcomingTrips = useMemo(() => trips.filter(t => !isTripCompleted(t)), [trips]);

  return { trips, completedTrips, upcomingTrips, loading, saveTrip, deleteTrip, fetchTrips, getTrip };
}
