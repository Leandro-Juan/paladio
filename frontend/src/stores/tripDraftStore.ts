import { create } from 'zustand';
import { TravelDocumentDraft } from '@/hooks/useTripTickets';
import { SelectedParticipant } from '@/components/trip-creation/ParticipantsManager';

export interface TripDraftData {
  destination: string;
  origin: string;
  originIata: string;
  destIata: string;
  startDate: string;
  endDate: string;
  departureHour: string;
  arrivalHour: string;
  budgetUsd: number | '';
  currency: string;
  tripTitle: string;
  tripDescription: string;
  hotelArea: string;
  hotelAddress?: string;
  hotelLat?: number;
  hotelLng?: number;
  hotelCheckInDate: string;
  hotelCheckOutDate: string;
  hotelCheckInHour: string;
  hotelCheckOutHour: string;
  participants: SelectedParticipant[];
  customPhotoUrl: string;
  isPhotoRemoved: boolean;
  personalizedPrompt: string;
  anchorMode: 'simulated' | 'direct';
  rawBookingText: string;
  scannedDocuments: TravelDocumentDraft[];
  selectedMode: 'personalized' | 'blank';
  hasUserModified: boolean;
}

export interface TripDraftStore extends TripDraftData {
  updateDraft: (updates: Partial<TripDraftData>, options?: { markModified?: boolean }) => void;
  resetDraft: () => void;
  initializeWithUser: (
    user: { id?: string | null; username?: string | null; email?: string | null } | null
  ) => void;
}

const STORAGE_KEY = 'paladio-trip-creation-draft';

export const formatLocalDateOffset = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_DRAFT: TripDraftData = {
  destination: '',
  origin: '',
  originIata: '',
  destIata: '',
  startDate: formatLocalDateOffset(7),
  endDate: formatLocalDateOffset(12),
  departureHour: '09:00',
  arrivalHour: '20:00',
  budgetUsd: 1500,
  currency: 'EUR',
  tripTitle: '',
  tripDescription: '',
  hotelArea: '',
  hotelAddress: '',
  hotelLat: undefined,
  hotelLng: undefined,
  hotelCheckInDate: formatLocalDateOffset(7),
  hotelCheckOutDate: formatLocalDateOffset(12),
  hotelCheckInHour: '15:00',
  hotelCheckOutHour: '11:00',
  participants: [
    {
      id: 'creator',
      name: 'You',
      is_guest: false,
      is_organizer: true,
    },
  ],
  customPhotoUrl: '',
  isPhotoRemoved: false,
  personalizedPrompt:
    'Visit the main cultural landmarks and museums. Love traditional bistros and relaxed cafes.',
  anchorMode: 'simulated',
  rawBookingText: '',
  scannedDocuments: [],
  selectedMode: 'personalized',
  hasUserModified: false,
};

function getInitialDraft(): TripDraftData {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DRAFT };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_DRAFT,
          ...parsed,
          budgetUsd:
            typeof parsed.budgetUsd === 'number' && !Number.isNaN(parsed.budgetUsd)
              ? Math.max(0, parsed.budgetUsd)
              : parsed.budgetUsd === ''
                ? ''
                : DEFAULT_DRAFT.budgetUsd,
          participants: Array.isArray(parsed.participants) && parsed.participants.length > 0
            ? parsed.participants
            : DEFAULT_DRAFT.participants,
          scannedDocuments: Array.isArray(parsed.scannedDocuments)
            ? parsed.scannedDocuments
            : [],
        };
      }
    }
  } catch (e) {
    console.warn('Could not read trip draft from localStorage:', e);
  }
  return { ...DEFAULT_DRAFT };
}

function persistDraft(state: TripDraftData) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, customPhotoUrl: '' }));
    } catch {
      console.warn('Could not persist trip draft to localStorage:', e);
    }
  }
}

export const useTripDraftStore = create<TripDraftStore>((set) => ({
  ...getInitialDraft(),

  updateDraft: (updates: Partial<TripDraftData>, options?: { markModified?: boolean }) => {
    set((state) => {
      const nextState: TripDraftData = {
        ...state,
        ...updates,
        hasUserModified: options?.markModified ?? true,
      };
      persistDraft(nextState);
      return nextState;
    });
  },

  resetDraft: () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    set({
      ...DEFAULT_DRAFT,
      startDate: formatLocalDateOffset(7),
      endDate: formatLocalDateOffset(12),
      hotelCheckInDate: formatLocalDateOffset(7),
      hotelCheckOutDate: formatLocalDateOffset(12),
      hasUserModified: false,
    });
  },

  initializeWithUser: (user) => {
    const userId = user?.id;
    if (!userId) return;
    set((state) => {
      const hasSelf = state.participants.some((p) => p.user_id === userId);
      if (hasSelf) return state;

      const withoutFallback = state.participants.filter((p) => p.id !== 'creator');
      const updatedParticipants: SelectedParticipant[] = [
        {
          id: userId,
          name: user.username || 'You',
          email: user.email || undefined,
          user_id: userId,
          is_guest: false,
          is_organizer: true,
        },
        ...withoutFallback,
      ];
      const nextState = {
        ...state,
        participants: updatedParticipants,
      };
      persistDraft(nextState);
      return nextState;
    });
  },
}));
