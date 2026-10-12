import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { TicketType, TicketStatus } from '@/lib/wallet/ticketTypeConfig';
export type { TicketType, TicketStatus };

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  filename: string;
  original_filename?: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export type TripTicketCreateInput = Partial<TripTicket> & {
  upload_id?: string | null;
  booking_reference?: string | null;
  departure_tz?: string | null;
  arrival_tz?: string | null;
};

export type TripTicketUpdateInput = Partial<TripTicket> & {
  booking_reference?: string | null;
  departure_tz?: string | null;
  arrival_tz?: string | null;
};

export interface TripTicket {
  id: string;
  trip_id: string;
  ticket_type: TicketType;
  title: string;
  provider?: string | null;
  reference_code?: string | null;
  booking_reference?: string | null;
  holder_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_tz?: string | null;
  end_tz?: string | null;
  departure_tz?: string | null;
  arrival_tz?: string | null;
  seat_or_room?: string | null;
  location_or_venue?: string | null;
  price?: number | null;
  currency?: string | null;
  status: TicketStatus;
  access_code?: string | null;
  barcode_value?: string | null;
  barcode_format?: 'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix' | null;
  metadata: Record<string, unknown>;
  notes?: string | null;
  source: string;
  source_ref?: string | null;
  user_modified: boolean;
  visibility: 'trip' | 'private';
  holder_user_id?: string | null;
  created_by?: string | null;
  pinned: boolean;
  drift: boolean;
  created_at: string;
  updated_at: string;
  attachments?: TicketAttachment[];
}

export interface AttractionSuggestion {
  poi_id: string;
  name: string;
  category: string;
  city: string;
  cost_eur: number;
  day?: number | null;
  suggested_time?: string | null;
}

export interface ScanDraft {
  ticket_type: TicketType;
  title: string;
  provider?: string | null;
  reference_code?: string | null;
  booking_reference?: string | null;
  holder_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_tz?: string | null;
  end_tz?: string | null;
  departure_tz?: string | null;
  arrival_tz?: string | null;
  seat_or_room?: string | null;
  location_or_venue?: string | null;
  price?: number | null;
  currency?: string | null;
  status: TicketStatus;
  access_code?: string | null;
  barcode_value?: string | null;
  barcode_format?: string | null;
  metadata: Record<string, unknown>;
  notes?: string | null;
  field_confidence: Record<string, number>;
  warnings: string[];
}

export interface ScanResponse {
  drafts: ScanDraft[];
  upload_id?: string | null;
  raw_text_excerpt?: string | null;
}

export function useTripTickets(tripId: string) {
  const [tickets, setTickets] = useState<TripTicket[]>([]);
  const [suggestions, setSuggestions] = useState<AttractionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasDrift, setHasDrift] = useState(false);

  const fetchTickets = useCallback(
    async (signal?: AbortSignal) => {
      if (!tripId) return;
      try {
        const res = await apiFetch<TripTicket[] | { tickets: TripTicket[]; suggestions: AttractionSuggestion[]; has_drift: boolean }>(
          `/trips/${tripId}/tickets?include=suggestions`,
          { signal }
        );
        if (Array.isArray(res)) {
          setTickets(res);
        } else if (res && Array.isArray(res.tickets)) {
          setTickets(res.tickets);
          if (Array.isArray(res.suggestions)) {
            setSuggestions(res.suggestions);
          }
          setHasDrift(Boolean(res.has_drift));
        }
        setLoading(false);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error('Failed to load trip tickets:', err);
        setLoading(false);
      }
    },
    [tripId]
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!tripId) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch<TripTicket[] | { tickets: TripTicket[]; suggestions: AttractionSuggestion[]; has_drift: boolean }>(
          `/trips/${tripId}/tickets?include=suggestions`,
          { signal: controller.signal }
        );
        if (Array.isArray(res)) {
          setTickets(res);
        } else if (res && Array.isArray(res.tickets)) {
          setTickets(res.tickets);
          if (Array.isArray(res.suggestions)) {
            setSuggestions(res.suggestions);
          }
          setHasDrift(Boolean(res.has_drift));
        }
        setLoading(false);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        console.error('Failed to load trip tickets:', err);
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [tripId]);

  const createTicket = useCallback(
    async (data: TripTicketCreateInput): Promise<TripTicket | null> => {
      try {
        const newTicket = await apiFetch<TripTicket>(`/trips/${tripId}/tickets`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        setTickets((prev) => [newTicket, ...prev]);
        useNotificationStore.getState().addNotification({
          type: 'success',
          title: 'Pass Added',
          message: `Saved "${newTicket.title}" to trip wallet.`,
        });
        return newTicket;
      } catch (err: unknown) {
        console.error('Failed to create ticket:', err);
        useNotificationStore.getState().addNotification({
          type: 'error',
          title: 'Ticket Save Error',
          message: err instanceof Error ? err.message : 'Could not save ticket.',
        });
        return null;
      }
    },
    [tripId]
  );

  const updateTicket = useCallback(
    async (ticketId: string, data: Partial<TripTicket>): Promise<TripTicket | null> => {
      // Optimistic update
      const prevTickets = [...tickets];
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, ...data, user_modified: true } : t))
      );

      try {
        const updated = await apiFetch<TripTicket>(`/trips/${tripId}/tickets/${ticketId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));
        useNotificationStore.getState().addNotification({
          type: 'success',
          title: 'Ticket Updated',
          message: `Updated "${updated.title}".`,
        });
        return updated;
      } catch (err: unknown) {
        // Rollback
        setTickets(prevTickets);
        useNotificationStore.getState().addNotification({
          type: 'error',
          title: 'Update Failed',
          message: err instanceof Error ? err.message : 'Could not update ticket.',
        });
        return null;
      }
    },
    [tripId, tickets]
  );

  const deleteTicket = useCallback(
    async (ticketId: string): Promise<boolean> => {
      const prevTickets = [...tickets];
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));

      try {
        await apiFetch(`/trips/${tripId}/tickets/${ticketId}`, {
          method: 'DELETE',
        });
        useNotificationStore.getState().addNotification({
          type: 'info',
          title: 'Pass Removed',
          message: 'The ticket was removed from the wallet.',
        });
        return true;
      } catch (err: unknown) {
        setTickets(prevTickets);
        useNotificationStore.getState().addNotification({
          type: 'error',
          title: 'Deletion Failed',
          message: err instanceof Error ? err.message : 'Could not delete ticket.',
        });
        return false;
      }
    },
    [tripId, tickets]
  );

  const syncFromItinerary = useCallback(async () => {
    try {
      const res = await apiFetch<{
        status: string;
        created_count: number;
        updated_count: number;
        has_drift: boolean;
        tickets: TripTicket[];
      }>(`/trips/${tripId}/tickets/sync`, {
        method: 'POST',
      });
      if (res && Array.isArray(res.tickets)) {
        setTickets(res.tickets);
        setHasDrift(Boolean(res.has_drift));
      }
      useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Itinerary Synced',
        message: `Synced with itinerary (${res.created_count} added, ${res.updated_count} updated).`,
      });
      return res;
    } catch (err: unknown) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Sync Failed',
        message: err instanceof Error ? err.message : 'Could not sync from itinerary.',
      });
      return null;
    }
  }, [tripId]);

  const scanDocument = useCallback(
    async (file?: File, rawText?: string): Promise<ScanResponse | null> => {
      const baseUrl = getApiBaseUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else if (rawText) {
        formData.append('raw_text', rawText);
      } else {
        return null;
      }

      try {
        const response = await fetch(`${baseUrl}/trips/${tripId}/tickets/scan`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Scan failed: HTTP ${response.status}`);
        }

        return (await response.json()) as ScanResponse;
      } catch (err: unknown) {
        useNotificationStore.getState().addNotification({
          type: 'error',
          title: 'Scan Error',
          message: err instanceof Error ? err.message : 'Failed to scan document.',
        });
        return null;
      }
    },
    [tripId]
  );

  return {
    tickets,
    suggestions,
    loading,
    isLoading: loading,
    hasDrift,
    fetchTickets,
    createTicket,
    updateTicket,
    deleteTicket,
    syncFromItinerary,
    syncItinerary: syncFromItinerary,
    scanDocument,
    scanFiles: async (input: File[] | File | string): Promise<ScanResponse | null> => {
      if (typeof input === 'string') {
        return scanDocument(undefined, input);
      }
      if (Array.isArray(input)) {
        return scanDocument(input[0], undefined);
      }
      return scanDocument(input, undefined);
    },
  };
}
