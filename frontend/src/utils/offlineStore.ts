import { apiFetch, getApiBaseUrl, getAuthToken } from '@/utils/api';
import type { Trip, TripExpense, TripSettlement } from '@/hooks/useTrips';
import type { AttractionSuggestion, TripTicket } from '@/hooks/useTripTickets';

const DB_NAME = 'paladio-offline-v1';
const DB_VERSION = 1;

export interface OfflineTripRecord {
  id: string;
  trip: Trip;
  pinnedOffline: boolean;
  syncedAt: string;
}

export interface OfflineTicketsRecord {
  trip_id: string;
  tickets: TripTicket[];
  suggestions: AttractionSuggestion[];
  has_drift: boolean;
  syncedAt: string;
}

export interface OfflineAttachmentRecord {
  attachment_id: string;
  trip_id: string;
  ticket_id: string;
  blob: Blob;
  mime_type: string;
  filename: string;
  syncedAt: string;
}

export interface OfflineExpensesRecord {
  trip_id: string;
  expenses: TripExpense[];
  settlement?: TripSettlement | null;
  syncedAt: string;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tickets')) {
        db.createObjectStore('tickets', { keyPath: 'trip_id' });
      }
      if (!db.objectStoreNames.contains('attachments')) {
        db.createObjectStore('attachments', { keyPath: 'attachment_id' });
      }
      if (!db.objectStoreNames.contains('expenses')) {
        db.createObjectStore('expenses', { keyPath: 'trip_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openOfflineDb();
  if (!db) return [];
  return new Promise<T[]>((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[] | undefined) ?? []);
    req.onerror = () => resolve([]);
  });
}

export async function saveOfflineTrip(trip: Trip, pinnedOffline?: boolean): Promise<void> {
  if (!trip.id) return;
  const existing = await idbGet<OfflineTripRecord>('trips', trip.id);
  await idbPut<OfflineTripRecord>('trips', {
    id: trip.id,
    trip,
    pinnedOffline: pinnedOffline ?? existing?.pinnedOffline ?? false,
    syncedAt: new Date().toISOString(),
  });
}

export async function getOfflineTrip(tripId: string): Promise<Trip | null> {
  const rec = await idbGet<OfflineTripRecord>('trips', tripId);
  return rec ? rec.trip : null;
}

export async function listOfflineTrips(): Promise<Trip[]> {
  const records = await idbGetAll<OfflineTripRecord>('trips');
  return records.map((r) => r.trip);
}

export async function isTripPinnedOffline(tripId: string): Promise<boolean> {
  const rec = await idbGet<OfflineTripRecord>('trips', tripId);
  return Boolean(rec?.pinnedOffline);
}

export async function saveOfflineTickets(
  tripId: string,
  tickets: TripTicket[],
  suggestions: AttractionSuggestion[] = [],
  hasDrift = false
): Promise<void> {
  await idbPut<OfflineTicketsRecord>('tickets', {
    trip_id: tripId,
    tickets,
    suggestions,
    has_drift: hasDrift,
    syncedAt: new Date().toISOString(),
  });
}

export async function getOfflineTickets(tripId: string): Promise<OfflineTicketsRecord | null> {
  return idbGet<OfflineTicketsRecord>('tickets', tripId);
}

export async function saveOfflineAttachment(record: Omit<OfflineAttachmentRecord, 'syncedAt'>): Promise<void> {
  await idbPut<OfflineAttachmentRecord>('attachments', {
    ...record,
    syncedAt: new Date().toISOString(),
  });
}

export async function getOfflineAttachment(attachmentId: string): Promise<OfflineAttachmentRecord | null> {
  return idbGet<OfflineAttachmentRecord>('attachments', attachmentId);
}

export async function saveOfflineExpenses(
  tripId: string,
  expenses: TripExpense[],
  settlement?: TripSettlement | null
): Promise<void> {
  const existing = await idbGet<OfflineExpensesRecord>('expenses', tripId);
  await idbPut<OfflineExpensesRecord>('expenses', {
    trip_id: tripId,
    expenses,
    settlement: settlement !== undefined ? settlement : existing?.settlement ?? null,
    syncedAt: new Date().toISOString(),
  });
}

export async function getOfflineExpenses(tripId: string): Promise<OfflineExpensesRecord | null> {
  return idbGet<OfflineExpensesRecord>('expenses', tripId);
}

export async function pinTripOffline(tripId: string): Promise<{
  tripCached: boolean;
  ticketsCached: number;
  attachmentsCached: number;
  expensesCached: number;
}> {
  const trip = await apiFetch<Trip>(`/trips/${tripId}`);
  await saveOfflineTrip(trip, true);

  let ticketsCached = 0;
  let attachmentsCached = 0;
  const ticketRes = await apiFetch<
    TripTicket[] | { tickets: TripTicket[]; suggestions: AttractionSuggestion[]; has_drift: boolean }
  >(`/trips/${tripId}/tickets?include=suggestions`);

  const ticketList = Array.isArray(ticketRes)
    ? ticketRes
    : Array.isArray(ticketRes?.tickets)
    ? ticketRes.tickets
    : [];
  const suggestionList = !Array.isArray(ticketRes) && Array.isArray(ticketRes?.suggestions)
    ? ticketRes.suggestions
    : [];
  const hasDrift = !Array.isArray(ticketRes) ? Boolean(ticketRes?.has_drift) : false;

  await saveOfflineTickets(tripId, ticketList, suggestionList, hasDrift);
  ticketsCached = ticketList.length;

  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();
  for (const ticket of ticketList) {
    for (const att of ticket.attachments || []) {
      try {
        const res = await fetch(
          `${baseUrl}/trips/${tripId}/tickets/${ticket.id}/attachments/${att.id}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (res.ok) {
          const blob = await res.blob();
          await saveOfflineAttachment({
            attachment_id: att.id,
            trip_id: tripId,
            ticket_id: ticket.id,
            blob,
            mime_type: att.mime_type || blob.type || 'application/octet-stream',
            filename: att.original_filename || att.filename || 'attachment',
          });
          attachmentsCached += 1;
        }
      } catch {
        // Ignore individual attachment failures during bulk pin
      }
    }
  }

  let expensesCached = 0;
  try {
    const [expenses, settlement] = await Promise.all([
      apiFetch<TripExpense[]>(`/trips/${tripId}/expenses`),
      apiFetch<TripSettlement>(`/trips/${tripId}/settlement?simplify=true`).catch(() => null),
    ]);
    await saveOfflineExpenses(tripId, expenses, settlement);
    expensesCached = expenses.length;
  } catch {
    // Non-fatal if expenses fail
  }

  return {
    tripCached: true,
    ticketsCached,
    attachmentsCached,
    expensesCached,
  };
}
