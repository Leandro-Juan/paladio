import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';
import { isTripCompleted } from '@/utils/tripParser';
import { TripPhotoItem } from '@/types/domain';
import {
  getOfflineExpenses,
  getOfflineTrip,
  listOfflineTrips,
  saveOfflineExpenses,
  saveOfflineTrip,
} from '@/utils/offlineStore';

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
  simplified?: boolean;
}

export interface CollaboratorOption {
  id: string;
  username: string;
  email: string;
}

export interface TripRevisionChangeItem {
  kind: string;
  verb: string;
  before_label?: string | null;
  connector?: string | null;
  after_label: string;
  target_label?: string | null;
  field?: string | null;
}

export interface TripRevisionItem {
  id: string;
  trip_id: string;
  revision: number;
  actor: string;
  actor_name: string;
  kind: string;
  summary: string;
  changes: TripRevisionChangeItem[];
  created_at: string;
  can_revert: boolean;
  is_current: boolean;
}

export interface TripRevisionListResponse {
  trip_id: string;
  current_revision: number;
  items: TripRevisionItem[];
}

export interface Trip {
  id?: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary_data: unknown;
  created_at?: string;
  participants?: TripParticipant[];
  tickets_count?: number;
  destination_timezone?: string;
  origin_iata?: string | null;
  destination_iata?: string | null;
  corridor?: string | null;
  status?: string;
  revision?: number;
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
        data.forEach((t) => {
          void saveOfflineTrip(t);
        });
        setLoading(false);
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        const cached = await listOfflineTrips();
        if (cached.length > 0) {
          setTrips(cached);
        } else {
          console.error("Failed to fetch trips", e);
        }
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
      data.forEach((t) => {
        void saveOfflineTrip(t);
      });
    } catch (e: unknown) {
      if (signal?.aborted) return;
      const cached = await listOfflineTrips();
      if (cached.length > 0) {
        setTrips(cached);
      } else {
        console.error("Failed to fetch trips", e);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleTripCreated = () => {
      void fetchTrips();
    };
    window.addEventListener('paladio:trip_created', handleTripCreated);
    return () => {
      window.removeEventListener('paladio:trip_created', handleTripCreated);
    };
  }, [fetchTrips]);

  const getTrip = useCallback(async (id: string, signal?: AbortSignal): Promise<Trip | null> => {
    try {
      const trip = await apiFetch<Trip>(`/trips/${id}`, { signal });
      void saveOfflineTrip(trip);
      return trip;
    } catch (e: unknown) {
      if (signal?.aborted) return null;
      const cached = await getOfflineTrip(id);
      if (cached) return cached;
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

  const updateTrip = async (id: string, updates: Partial<Omit<Trip, 'id' | 'created_at'>>) => {
    try {
      const updated = await apiFetch<Trip>(`/trips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      setTrips(prev => prev.map(t => t.id === id ? updated : t));
      return updated;
    } catch (e) {
      console.error("Failed to update trip", e);
    }
    return null;
  };

  const reoptimizeTrip = async (
    id: string,
    updates?: Partial<Omit<Trip, 'id' | 'created_at'>>,
    day?: number
  ) => {
    try {
      const endpoint = day !== undefined ? `/trips/${id}/reoptimize?day=${day}` : `/trips/${id}/reoptimize`;
      const updated = await apiFetch<Trip>(endpoint, {
        method: 'POST',
        body: updates ? JSON.stringify(updates) : undefined,
      });
      setTrips(prev => prev.map(t => t.id === id ? updated : t));
      return updated;
    } catch (e) {
      console.error("Failed to reoptimize trip", e);
      throw e;
    }
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

  const getTripExpenses = useCallback(async (tripId: string) => {
    try {
      const expenses = await apiFetch<TripExpense[]>(`/trips/${tripId}/expenses`);
      void saveOfflineExpenses(tripId, expenses);
      return expenses;
    } catch (e) {
      const cached = await getOfflineExpenses(tripId);
      if (cached) return cached.expenses;
      console.error("Failed to get expenses", e);
      return [];
    }
  }, []);

  const addTripExpense = useCallback(async (
    tripId: string,
    data: {
      payer_id: string;
      description: string;
      amount: number;
      currency?: string;
      category?: string;
      split_type?: string;
      splits?: ExpenseSplit[];
      expense_date?: string;
    }
  ) => {
    return await apiFetch<TripExpense>(`/trips/${tripId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }, []);

  const updateTripExpense = useCallback(async (
    tripId: string,
    expenseId: string,
    data: {
      payer_id: string;
      description: string;
      amount: number;
      currency?: string;
      category?: string;
      split_type?: string;
      splits?: ExpenseSplit[];
      expense_date?: string;
    }
  ) => {
    return await apiFetch<TripExpense>(`/trips/${tripId}/expenses/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }, []);

  const deleteTripExpense = useCallback(async (tripId: string, expenseId: string) => {
    try {
      await apiFetch(`/trips/${tripId}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (e) {
      console.error("Failed to delete expense", e);
      return false;
    }
  }, []);

  const getTripSettlement = useCallback(async (tripId: string, simplify: boolean = false) => {
    try {
      const q = simplify ? '?simplify=true' : '?simplify=false';
      const settlement = await apiFetch<TripSettlement>(`/trips/${tripId}/settlement${q}`);
      const existing = await getOfflineExpenses(tripId);
      void saveOfflineExpenses(tripId, existing?.expenses || [], settlement);
      return settlement;
    } catch (e) {
      const cached = await getOfflineExpenses(tripId);
      if (cached?.settlement) return cached.settlement;
      console.error("Failed to get settlement", e);
      return null;
    }
  }, []);

  const getCollaboratorOptions = async () => {
    try {
      return await apiFetch<CollaboratorOption[]>('/users/collaborators/options');
    } catch (e) {
      console.error("Failed to get collaborator options", e);
      return [];
    }
  };

  const uploadTripPhotos = async (tripId: string, files: File[]): Promise<TripPhotoItem[]> => {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return await apiFetch<TripPhotoItem[]>(`/trips/${tripId}/photos`, {
        method: 'POST',
        body: formData,
      });
    } catch (e) {
      console.error("Failed to upload trip photos", e);
      throw e;
    }
  };

  const deleteTripPhoto = async (tripId: string, photoId: string): Promise<boolean> => {
    try {
      await apiFetch(`/trips/${tripId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (e) {
      console.error("Failed to delete trip photo", e);
      return false;
    }
  };

  const getTripRevisions = useCallback(async (tripId: string): Promise<TripRevisionListResponse> => {
    return await apiFetch<TripRevisionListResponse>(`/trips/${tripId}/revisions`);
  }, []);

  const revertTripRevision = useCallback(async (tripId: string, revisionId: string): Promise<Trip> => {
    const updated = await apiFetch<Trip>(`/trips/${tripId}/revisions/${encodeURIComponent(revisionId)}/revert`, {
      method: 'POST',
    });
    setTrips(prev => prev.map(t => t.id === tripId ? updated : t));
    return updated;
  }, []);

  const restoreTripVersion = useCallback(async (tripId: string, targetRevision: number): Promise<Trip> => {
    const updated = await apiFetch<Trip>(`/trips/${tripId}/revisions/${targetRevision}/restore`, {
      method: 'POST',
    });
    setTrips(prev => prev.map(t => t.id === tripId ? updated : t));
    return updated;
  }, []);

  const scheduledTrips = useMemo(
    () => trips.filter(t => t.status !== 'deal_proposal' && t.status !== 'superseded' && t.status !== 'discarded'),
    [trips]
  );
  const completedTrips = useMemo(() => scheduledTrips.filter(t => isTripCompleted(t)), [scheduledTrips]);
  const upcomingTrips = useMemo(() => scheduledTrips.filter(t => !isTripCompleted(t)), [scheduledTrips]);

  return {
    trips: scheduledTrips,
    completedTrips,
    upcomingTrips,
    loading,
    saveTrip,
    updateTrip,
    reoptimizeTrip,
    deleteTrip,
    fetchTrips,
    getTrip,
    addParticipant,
    removeParticipant,
    getTripExpenses,
    addTripExpense,
    updateTripExpense,
    deleteTripExpense,
    getTripSettlement,
    getCollaboratorOptions,
    uploadTripPhotos,
    deleteTripPhoto,
    getTripRevisions,
    revertTripRevision,
    restoreTripVersion,
  };
}
