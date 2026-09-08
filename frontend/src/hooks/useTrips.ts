import { useState, useEffect, useCallback } from 'react';

export interface Trip {
  id?: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary_data: unknown;
  created_at?: string;
}

export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
};

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/`);
      if (res.ok) {
        const data = await res.json();
        setTrips(data);
      }
    } catch (e) {
      console.error("Failed to fetch trips", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchTrips();
  }, [fetchTrips]);

  const getTrip = useCallback(async (id: string): Promise<Trip | null> => {
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch trip", e);
    }
    return null;
  }, []);

  const saveTrip = async (tripData: Omit<Trip, 'id' | 'created_at'>) => {
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tripData)
      });
      if (res.ok) {
        const newTrip = await res.json();
        setTrips(prev => [...prev, newTrip]);
        return newTrip;
      }
    } catch (e) {
      console.error("Failed to save trip", e);
    }
    return null;
  };

  const deleteTrip = async (id: string) => {
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setTrips(prev => prev.filter(t => t.id !== id));
        return true;
      }
    } catch (e) {
      console.error("Failed to delete trip", e);
    }
    return false;
  };

  return { trips, loading, saveTrip, deleteTrip, fetchTrips, getTrip };
}
