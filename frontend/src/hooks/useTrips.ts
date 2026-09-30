import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';
import { isTripCompleted } from '@/utils/tripParser';

export { getApiBaseUrl };

export interface TripParticipant {
  id: string;
  trip_id: string;
  user_id?: string | null;
  name: string;
  email?: string | null;
  role: string;
  created_at: string;
}

export interface ExpenseSplit {
  participant_id: string;
  amount: number;
}

export interface TripExpense {
  id: string;
  trip_id: string;
  payer_id: string;
  payer_name?: string | null;
  description: string;
  amount: number;
  currency: string;
  category: string;
  split_type: string;
  splits: ExpenseSplit[];
  expense_date?: string | null;
  created_at: string;
}

export interface ParticipantBalance {
  participant_id: string;
  name: string;
  total_paid: number;
  total_share: number;
  net_balance: number;
}

export interface SettlementTransfer {
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  amount: number;
}

export interface TripSettlement {
  trip_id: string;
  total_expenses: number;
  currency: string;
  balances: ParticipantBalance[];
  transfers: SettlementTransfer[];
}

export interface CollaboratorOption {
  id: string;
  username: string;
  email: string;
}

export interface Trip {
  id?: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary_data: unknown;
  created_at?: string;
  participants?: TripParticipant[];
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

  const addParticipant = async (tripId: string, data: { name: string; user_id?: string; email?: string; role?: string }) => {
    try {
      const newParticipant = await apiFetch<TripParticipant>(`/trips/${tripId}/participants`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setTrips(prev => prev.map(t => {
        if (t.id === tripId) {
          const parts = t.participants ? [...t.participants, newParticipant] : [newParticipant];
          return { ...t, participants: parts };
        }
        return t;
      }));
      return newParticipant;
    } catch (e) {
      console.error("Failed to add participant", e);
      return null;
    }
  };

  const removeParticipant = async (tripId: string, participantId: string) => {
    try {
      await apiFetch(`/trips/${tripId}/participants/${participantId}`, {
        method: 'DELETE',
      });
      setTrips(prev => prev.map(t => {
        if (t.id === tripId) {
          const parts = (t.participants || []).filter(p => p.id !== participantId);
          return { ...t, participants: parts };
        }
        return t;
      }));
      return true;
    } catch (e) {
      console.error("Failed to remove participant", e);
      return false;
    }
  };

  const getTripExpenses = async (tripId: string) => {
    try {
      return await apiFetch<TripExpense[]>(`/trips/${tripId}/expenses`);
    } catch (e) {
      console.error("Failed to get expenses", e);
      return [];
    }
  };

  const addTripExpense = async (
    tripId: string,
    data: {
      payer_id: string;
      description: string;
      amount: number;
      category?: string;
      split_type?: string;
      splits?: ExpenseSplit[];
      expense_date?: string;
    }
  ) => {
    try {
      return await apiFetch<TripExpense>(`/trips/${tripId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.error("Failed to add expense", e);
      return null;
    }
  };

  const deleteTripExpense = async (tripId: string, expenseId: string) => {
    try {
      await apiFetch(`/trips/${tripId}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (e) {
      console.error("Failed to delete expense", e);
      return false;
    }
  };

  const getTripSettlement = async (tripId: string) => {
    try {
      return await apiFetch<TripSettlement>(`/trips/${tripId}/settlement`);
    } catch (e) {
      console.error("Failed to get settlement", e);
      return null;
    }
  };

  const getCollaboratorOptions = async () => {
    try {
      return await apiFetch<CollaboratorOption[]>('/users/collaborators/options');
    } catch (e) {
      console.error("Failed to get collaborator options", e);
      return [];
    }
  };

  const completedTrips = useMemo(() => trips.filter(t => isTripCompleted(t)), [trips]);
  const upcomingTrips = useMemo(() => trips.filter(t => !isTripCompleted(t)), [trips]);

  return {
    trips,
    completedTrips,
    upcomingTrips,
    loading,
    saveTrip,
    deleteTrip,
    fetchTrips,
    getTrip,
    addParticipant,
    removeParticipant,
    getTripExpenses,
    addTripExpense,
    deleteTripExpense,
    getTripSettlement,
    getCollaboratorOptions,
  };
}
