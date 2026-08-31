import { useState, useEffect } from 'react';

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

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const host = window.location.hostname;
      const res = await fetch(`http://${host}:8000/api/v1/trips/`);
      if (res.ok) {
        const data = await res.json();
        setTrips(data);
      }
    } catch (e) {
      console.error("Failed to fetch trips", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchTrips();
  }, []);

  const saveTrip = async (tripData: Omit<Trip, 'id' | 'created_at'>) => {
    try {
      const host = window.location.hostname;
      const res = await fetch(`http://${host}:8000/api/v1/trips/`, {
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
      const host = window.location.hostname;
      const res = await fetch(`http://${host}:8000/api/v1/trips/${id}`, {
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

  return { trips, loading, saveTrip, deleteTrip, fetchTrips };
}
