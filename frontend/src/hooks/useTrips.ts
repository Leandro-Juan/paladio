import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';

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
    let ignore = false;
    async function load() {
      try {
        const data = await apiFetch<Trip[]>('/trips/');
        if (!ignore) {
          setTrips(data);
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to fetch trips", e);
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const fetchTrips = useCallback(async () => {
    try {
      const data = await apiFetch<Trip[]>('/trips/');
      setTrips(data);
    } catch (e) {
      console.error("Failed to fetch trips", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const getTrip = useCallback(async (id: string): Promise<Trip | null> => {
    try {
      return await apiFetch<Trip>(`/trips/${id}`);
    } catch (e) {
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

  return { trips, loading, saveTrip, deleteTrip, fetchTrips, getTrip };
}
