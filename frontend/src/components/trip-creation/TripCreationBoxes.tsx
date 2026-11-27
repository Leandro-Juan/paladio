"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/contexts/AuthContext';
import { MealRequirement } from '@/types/domain';
import {
  PinIcon,
  Spinner,
  CheckIcon,
  SettingsIcon,
  StarIcon,
  DocumentIcon,
  ArrowRightIcon,
  BulbIcon,
  CompassIcon,
  LightningIcon,
  PaperclipIcon,
  CloseIcon,
  PlusIcon,
} from '@/components/icons';
import { RouteIntakeBar } from './RouteIntakeBar';
import { HotelStayAnchorBar } from './HotelStayAnchorBar';
import { PaladioDateRangePicker } from './PaladioDateRangePicker';
import { DocumentUploadModal, ExtractedTravelDocData } from './DocumentUploadModal';
import { TravelDocumentDraft } from '@/hooks/useTripTickets';
import { useTripDraftStore } from '@/stores/tripDraftStore';
import { useTripGenerationStore } from '@/stores/tripGenerationStore';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { getCurrencyInfo, CurrencyInfo } from '@/utils/currencyResolver';
import { ParticipantsManager, SelectedParticipant } from './ParticipantsManager';
import { PhotoUploadModal } from './PhotoUploadModal';
import { DemoLockedButton } from '@/components/common/DemoFeatureGate';

interface TripCreationBoxesProps {
  onPersonalizedSubmit: (prompt: string, extras: Record<string, unknown>) => void;
  onBlankSubmitStart?: (msg?: string) => void;
  onBlankSubmitError?: (err: string) => void;
  externalError?: string | null;
  onClearExternalError?: () => void;
  disabled?: boolean;
  demoLockedSubmit?: boolean;
  initialDestination?: string;
  initialOrigin?: string;
  initialOriginIata?: string;
  initialDestIata?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialBudget?: number;
  initialCurrency?: string;
  initialDepartureHour?: string;
  initialArrivalHour?: string;
  initialHotelArea?: string;
  initialHotelAddress?: string;
  initialTravelers?: number;
  hasQueryPrefill?: boolean;
  querySource?: string;
  queryPrefillKey?: string;
  status?: string;
  onReconnect?: () => void;
}

export function TripCreationBoxes({
  onPersonalizedSubmit,
  onBlankSubmitStart,
  onBlankSubmitError,
  externalError = null,
  onClearExternalError,
  disabled = false,
  demoLockedSubmit = false,
  initialDestination = '',
  initialOrigin = '',
  initialOriginIata,
  initialDestIata,
  initialStartDate,
  initialEndDate,
  initialBudget = 1500,
  initialCurrency,
  initialDepartureHour,
  initialArrivalHour,
  initialHotelArea,
  initialHotelAddress,
  initialTravelers,
  hasQueryPrefill = false,
  querySource,
  queryPrefillKey,
  status = 'connected',
  onReconnect,
}: TripCreationBoxesProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const draft = useTripDraftStore();
  const {
    destination,
    origin,
    originIata,
    destIata,
    startDate,
    endDate,
    departureHour,
    arrivalHour,
    budgetUsd,
    currency,
    tripTitle,
    tripDescription,
    hotelArea,
    hotelAddress,
    hotelLat,
    hotelLng,
    hotelCheckInDate,
    hotelCheckOutDate,
    hotelCheckInHour,
    hotelCheckOutHour,
    participants,
    customPhotoUrl,
    isPhotoRemoved,
    personalizedPrompt,
    anchorMode,
    rawBookingText,
    scannedDocuments,
    selectedMode,
    hasUserModified,
    updateDraft,
    initializeWithUser,
  } = draft;

  const systemCurrency = (currentUser?.preferences?.default_currency as string) || 'EUR';

  // Initialize organizer from logged-in user
  useEffect(() => {
    if (currentUser && (!currentUser.id || participants.some((p) => p.id === 'creator'))) {
      initializeWithUser(currentUser);
    }
  }, [currentUser, participants, initializeWithUser]);

  const lastAppliedPrefillRef = useRef<string | null>(null);

  // Synchronize initial query props:
  // - When explicit query prefill params are present (e.g., from a Deal Package "Make it a Trip"),
  //   always apply them once per unique query string, overriding any stale draft in localStorage.
  // - Otherwise, only populate fallback defaults if the user hasn't modified the draft yet.
  useEffect(() => {
    if (hasQueryPrefill) {
      const key =
        queryPrefillKey ||
        `${initialDestination}|${initialOrigin}|${initialStartDate}|${initialEndDate}|${initialBudget}`;
      if (lastAppliedPrefillRef.current === key) return;
      lastAppliedPrefillRef.current = key;

      const updates: Partial<typeof draft> = {};
      if (initialDestination) updates.destination = initialDestination;
      if (initialOrigin) updates.origin = initialOrigin;
      if (initialOriginIata !== undefined) updates.originIata = initialOriginIata;
      if (initialDestIata !== undefined) updates.destIata = initialDestIata;
      if (initialStartDate) {
        updates.startDate = initialStartDate;
        updates.hotelCheckInDate = initialStartDate;
      }
      if (initialEndDate) {
        updates.endDate = initialEndDate;
        updates.hotelCheckOutDate = initialEndDate;
      }
      if (initialBudget !== undefined) updates.budgetUsd = initialBudget;
      if (initialCurrency) updates.currency = initialCurrency;
      if (initialDepartureHour) updates.departureHour = initialDepartureHour;
      if (initialArrivalHour) updates.arrivalHour = initialArrivalHour;

      if (initialTravelers !== undefined && initialTravelers >= 1) {
        let nextParticipants = [...participants];
        if (nextParticipants.length < initialTravelers) {
          let idxCounter = nextParticipants.length + 1;
          while (nextParticipants.length < initialTravelers) {
            const candidateId = `deal-guest-${idxCounter}`;
            if (!nextParticipants.some((p) => p.id === candidateId)) {
              nextParticipants.push({
                id: candidateId,
                name: t('engine.deal_guest_name', { index: idxCounter }),
                is_guest: true,
                is_organizer: false,
              });
            }
            idxCounter++;
          }
        } else if (nextParticipants.length > initialTravelers) {
          // Shrink trailing non-organizer deal guests to match requested traveler count
          for (let i = nextParticipants.length - 1; i >= 0 && nextParticipants.length > initialTravelers; i--) {
            const p = nextParticipants[i];
            if (!p.is_organizer && p.id.startsWith('deal-guest-')) {
              nextParticipants.splice(i, 1);
            }
          }
          nextParticipants = nextParticipants.slice(0, Math.max(1, initialTravelers));
        }
        updates.participants = nextParticipants;
      }

      if (querySource === 'deal') {
        updates.hotelArea = initialHotelArea || '';
        updates.hotelAddress = initialHotelAddress || '';
        updates.hotelLat = undefined;
        updates.hotelLng = undefined;
      } else {
        if (initialHotelArea !== undefined) updates.hotelArea = initialHotelArea;
        if (initialHotelAddress !== undefined) updates.hotelAddress = initialHotelAddress;
      }

      if (Object.keys(updates).length > 0) {
        updateDraft(updates);
      }
      return;
    }

    if (!hasUserModified) {
      const updates: Partial<typeof draft> = {};
      if (initialDestination && initialDestination !== destination) updates.destination = initialDestination;
      if (initialOrigin && initialOrigin !== origin) updates.origin = initialOrigin;
      if (initialStartDate && initialStartDate !== startDate) updates.startDate = initialStartDate;
      if (initialEndDate && initialEndDate !== endDate) updates.endDate = initialEndDate;
      if (initialBudget !== undefined && initialBudget !== budgetUsd) updates.budgetUsd = initialBudget;
      if (Object.keys(updates).length > 0) {
        updateDraft(updates, { markModified: false });
      }
    }
  }, [
    hasQueryPrefill,
    queryPrefillKey,
    querySource,
    initialDestination,
    initialOrigin,
    initialOriginIata,
    initialDestIata,
    initialStartDate,
    initialEndDate,
    initialBudget,
    initialCurrency,
    initialDepartureHour,
    initialArrivalHour,
    initialHotelArea,
    initialHotelAddress,
    initialTravelers,
    hasUserModified,
  ]);

  // Document upload modal state
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [blankSuccess, setBlankSuccess] = useState<string | null>(null);

  const clearErrors = () => {
    setBlankError(null);
    onClearExternalError?.();
  };
  const activeError = blankError || externalError;

  // Setters delegating to persistent draft store
  const setSelectedMode = (mode: 'personalized' | 'blank') => updateDraft({ selectedMode: mode });
  const setDestination = (val: string) => {
    const isNewDest = destination.trim() && val.trim().toLowerCase() !== destination.trim().toLowerCase();
    if (isNewDest) {
      updateDraft({
        destination: val,
        hotelArea: '',
        hotelAddress: '',
        hotelLat: undefined,
        hotelLng: undefined,
      });
    } else {
      updateDraft({ destination: val });
    }
  };
  const setOrigin = (val: string) => updateDraft({ origin: val });
  const setOriginIata = (val: string) => updateDraft({ originIata: val });
  const setDestIata = (val: string) => updateDraft({ destIata: val });
  const setStartDate = (val: string) => updateDraft({ startDate: val });
  const setEndDate = (val: string) => updateDraft({ endDate: val });
  const setDepartureHour = (val: string) => updateDraft({ departureHour: val });
  const setArrivalHour = (val: string) => updateDraft({ arrivalHour: val });
  const setBudgetUsd = (val: number | '') => updateDraft({ budgetUsd: val });
  const setCurrency = (val: string) => updateDraft({ currency: val });
  const setTripTitle = (val: string) => updateDraft({ tripTitle: val });
  const setTripDescription = (val: string) => updateDraft({ tripDescription: val });
  const setHotelArea = (val: string) => updateDraft({ hotelArea: val });
  const setHotelInfo = (
    name: string,
    extra?: { address?: string; lat?: number; lng?: number }
  ) => {
    if (extra === undefined) {
      updateDraft({
        hotelArea: name,
        hotelAddress: '',
        hotelLat: undefined,
        hotelLng: undefined,
      });
      return;
    }
    updateDraft({
      hotelArea: name,
      hotelAddress: extra.address ?? '',
      hotelLat: extra.lat,
      hotelLng: extra.lng,
    });
  };
  const setHotelCheckInHour = (val: string) => updateDraft({ hotelCheckInHour: val });
  const setHotelCheckOutHour = (val: string) => updateDraft({ hotelCheckOutHour: val });
  const setParticipants = (val: SelectedParticipant[]) => updateDraft({ participants: val });
  const setCustomPhotoUrl = (val: string) => updateDraft({ customPhotoUrl: val });
  const setIsPhotoRemoved = (val: boolean) => updateDraft({ isPhotoRemoved: val });
  const setPersonalizedPrompt = (val: string) => updateDraft({ personalizedPrompt: val });
  const setAnchorMode = (val: 'simulated' | 'direct') => updateDraft({ anchorMode: val });
  const setRawBookingText = (val: string) => updateDraft({ rawBookingText: val });
  const setScannedDocuments = (
    updater: TravelDocumentDraft[] | ((prev: TravelDocumentDraft[]) => TravelDocumentDraft[])
  ) => {
    if (typeof updater === 'function') {
      updateDraft({ scannedDocuments: updater(scannedDocuments) });
    } else {
      updateDraft({ scannedDocuments: updater });
    }
  };

  const travelersCount = Math.max(1, participants.length);
  const [meals] = useState<MealRequirement[]>([
    { meal_type: 'BREAKFAST', start_time: '08:00', end_time: '10:00' },
    { meal_type: 'LUNCH', start_time: '12:00', end_time: '14:30' },
    { meal_type: 'DINNER', start_time: '19:30', end_time: '22:00' },
  ]);

  const parseLocalIsoDate = (iso: string): Date => {
    const [y, m, d] = iso.split('T')[0].split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const formatLocalIsoDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Calculate inclusive duration in calendar days
  const tripDurationDays = useMemo(() => {
    if (!startDate || !endDate) return 5;
    const start = parseLocalIsoDate(startDate);
    const end = parseLocalIsoDate(endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 1;
  }, [startDate, endDate]);

  const handlePhotoSelect = (dataUrl: string) => {
    setCustomPhotoUrl(dataUrl);
    setIsPhotoRemoved(false);
    setIsUploadModalOpen(false);
  };

  const getDestinationPhotoUrl = (city: string) => {
    if (customPhotoUrl) return customPhotoUrl;
    const c = (city || '').toLowerCase().trim();
    if (c.includes('paris')) return 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('madrid')) return 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('tokyo')) return 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('london')) return 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('rome')) return 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('seville') || c.includes('sevilla')) return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('barcelona')) return 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('amsterdam')) return 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('new york') || c.includes('nyc')) return 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('berlin')) return 'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1200&q=80';
    return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
  };

  const currentPhoto = !isPhotoRemoved ? (customPhotoUrl || getDestinationPhotoUrl(destination)) : '';

  const handleExtracted = (data: ExtractedTravelDocData) => {
    const today = formatLocalIsoDate(new Date());
    if (data.departure_date && data.departure_date < today) {
      setBlankError(
        t('engine.doc_apply_past_departure_short', { date: data.departure_date, today })
      );
      return;
    }
    if (data.check_in_date && data.check_in_date < today) {
      setBlankError(
        t('engine.doc_apply_past_checkin_short', { date: data.check_in_date, today })
      );
      return;
    }
    clearErrors();

    const updates: Partial<typeof draft> = {};
    const hasScannedFlight = scannedDocuments.some((d) => d.ticket_type === 'flight');
    const isHotelOnly = data.document_type === 'hotel';
    const isReturnFlight =
      !isHotelOnly &&
      hasScannedFlight &&
      Boolean(data.departure_date) &&
      Boolean(startDate) &&
      data.departure_date! >= startDate &&
      Boolean(
        (data.origin_iata && destIata && data.origin_iata.toUpperCase() === destIata.toUpperCase()) ||
          (data.destination_iata && originIata && data.destination_iata.toUpperCase() === originIata.toUpperCase())
      );

    if (isReturnFlight) {
      updates.endDate = data.departure_date!;
      if (!hotelCheckOutDate || hotelCheckOutDate === endDate) {
        updates.hotelCheckOutDate = data.departure_date!;
      }
      const returnDepHour = data.flight_departure_hour || data.departure_hour;
      if (returnDepHour) {
        updates.arrivalHour = returnDepHour;
      }
    } else {
      if (data.origin_city) updates.origin = data.origin_city;
      else if (data.origin_iata) updates.origin = data.origin_iata;
      if (data.origin_iata) updates.originIata = data.origin_iata;

      const nextDest = data.destination_city || data.destination_iata;
      if (nextDest) {
        const isNewDest = destination.trim() && nextDest.trim().toLowerCase() !== destination.trim().toLowerCase();
        updates.destination = nextDest;
        if (isNewDest && !data.hotel_name && !data.hotel_address) {
          updates.hotelArea = '';
          updates.hotelAddress = '';
          updates.hotelLat = undefined;
          updates.hotelLng = undefined;
        }
      }
      if (data.destination_iata) updates.destIata = data.destination_iata;

      if (data.departure_date && (!isHotelOnly || !hasScannedFlight)) {
        const start = data.departure_date;
        let end = data.return_date;
        if (!end) {
          if (endDate && endDate >= start) {
            end = endDate;
          } else {
            const sDate = parseLocalIsoDate(start);
            sDate.setDate(sDate.getDate() + 5);
            end = formatLocalIsoDate(sDate);
          }
        }
        updates.startDate = start;
        updates.endDate = end;
        if (!data.check_in_date && (!hotelCheckInDate || hotelCheckInDate === startDate || hotelCheckInDate < start)) {
          updates.hotelCheckInDate = start;
        }
        if (!data.check_out_date && (!hotelCheckOutDate || hotelCheckOutDate === endDate || hotelCheckOutDate < start)) {
          updates.hotelCheckOutDate = end;
        }
      }

      // Only flight / trip_package docs update flight arrival/departure hours
      if (!isHotelOnly) {
        if (data.flight_arrival_hour) {
          updates.departureHour = data.flight_arrival_hour;
        } else if (data.departure_hour) {
          updates.departureHour = data.departure_hour;
        }

        if (data.return_departure_hour) {
          updates.arrivalHour = data.return_departure_hour;
        } else if (data.arrival_hour) {
          updates.arrivalHour = data.arrival_hour;
        }
      }
    }

    // Hotel details and check-in / check-out constraints
    if (data.hotel_name || data.hotel_address) {
      const nextHotelName = data.hotel_name || hotelArea;
      const isDifferentHotel = nextHotelName.trim().toLowerCase() !== hotelArea.trim().toLowerCase();
      updates.hotelArea = nextHotelName;
      updates.hotelAddress = data.hotel_address || (isDifferentHotel ? '' : hotelAddress);
      if (isDifferentHotel) {
        updates.hotelLat = undefined;
        updates.hotelLng = undefined;
      }
    }
    if (data.check_in_date) {
      updates.hotelCheckInDate = data.check_in_date;
    }
    if (data.check_out_date) {
      updates.hotelCheckOutDate = data.check_out_date;
    }
    if (data.check_in_hour) {
      updates.hotelCheckInHour = data.check_in_hour;
    }
    if (data.check_out_hour) {
      updates.hotelCheckOutHour = data.check_out_hour;
    }

    // Save full document draft(s) into state for later wallet persistence
    if (data.drafts && data.drafts.length > 0) {
      updates.scannedDocuments = [...scannedDocuments, ...data.drafts];
    } else if (data.document_type === 'flight' || data.flight_number || data.carrier) {
      const flightDepHour = data.flight_departure_hour || data.departure_hour;
      const depTime = data.departure_date
        ? `${data.departure_date}T${flightDepHour || '12:00'}:00`
        : undefined;
      const synthesized: TravelDocumentDraft = {
        ticket_type: 'flight',
        title: `${data.flight_number || t('dashboard.flight_fallback')} ${data.origin_iata || data.origin_city || t('engine.origin_titlecase')} → ${data.destination_iata || data.destination_city || t('engine.destination_titlecase')}`,
        provider: data.carrier || undefined,
        reference_code: data.reference_code || undefined,
        holder_name: data.holder_name || undefined,
        start_time: depTime,
        seat_or_room: data.seat || undefined,
        status: 'confirmed',
        metadata: {
          flight_number: data.flight_number,
          carrier: data.carrier,
          origin_iata: data.origin_iata,
          destination_iata: data.destination_iata,
          origin_city: data.origin_city,
          destination_city: data.destination_city,
          seat: data.seat,
          departure_date: data.departure_date,
          departure_hour: flightDepHour,
          flight_departure_hour: flightDepHour,
          arrival_hour: data.flight_arrival_hour || data.arrival_hour,
          is_return_leg: isReturnFlight,
        },
        field_confidence: {},
        warnings: [],
      };
      updates.scannedDocuments = [...scannedDocuments, synthesized];
    } else if (data.hotel_name) {
      const checkInTime = data.check_in_date
        ? `${data.check_in_date}T${data.check_in_hour || '15:00'}:00`
        : undefined;
      const checkOutTime = data.check_out_date
        ? `${data.check_out_date}T${data.check_out_hour || '11:00'}:00`
        : undefined;
      const synthesized: TravelDocumentDraft = {
        ticket_type: 'hotel',
        title: t('engine.hotel_stay_title', { hotel: data.hotel_name }),
        provider: data.hotel_name,
        reference_code: data.reference_code || undefined,
        holder_name: data.holder_name || undefined,
        start_time: checkInTime,
        end_time: checkOutTime,
        location_or_venue: data.hotel_address || undefined,
        status: 'confirmed',
        metadata: {
          hotel_name: data.hotel_name,
          address: data.hotel_address,
          check_in_date: data.check_in_date,
          check_out_date: data.check_out_date,
        },
        field_confidence: {},
        warnings: [],
      };
      updates.scannedDocuments = [...scannedDocuments, synthesized];
    }

    updateDraft(updates);
  };

  // Handle Blank Trip Submission
  const handleCreateBlankTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoLockedSubmit) return;
    if (!destination.trim()) {
      setBlankError(t('engine.err_destination_required'));
      return;
    }
    if (!startDate || !endDate) {
      setBlankError(t('engine.err_dates_required'));
      return;
    }
    const today = formatLocalIsoDate(new Date());
    if (startDate < today) {
      setBlankError(t('engine.err_start_before_today', { startDate, today }));
      return;
    }
    if (endDate < startDate) {
      setBlankError(t('engine.err_end_before_start'));
      return;
    }
    const rawCheckIn = hotelCheckInDate || startDate;
    const rawCheckOut = hotelCheckOutDate || endDate;
    if (rawCheckOut < rawCheckIn) {
      setBlankError(t('engine.err_checkout_before_checkin'));
      return;
    }
    const effectiveCheckInDate = rawCheckIn < startDate ? startDate : (rawCheckIn > endDate ? endDate : rawCheckIn);
    const effectiveCheckOutDate = rawCheckOut > endDate ? endDate : (rawCheckOut < effectiveCheckInDate ? effectiveCheckInDate : rawCheckOut);
    if (!participants || participants.length === 0) {
      setBlankError(t('engine.err_participant_required'));
      return;
    }
    clearErrors();
    setIsCreatingBlank(true);
    onBlankSubmitStart?.(t('engine.creating_blank_workspace'));

    const res = await useTripGenerationStore.getState().startBlankJob({
      destination,
      origin,
      originIata,
      destIata,
      startDate,
      endDate,
      departureHour,
      arrivalHour,
      budgetUsd,
      currency,
      tripTitle,
      tripDescription,
      hotelArea,
      hotelAddress,
      hotelLat,
      hotelLng,
      hotelCheckInDate: effectiveCheckInDate,
      hotelCheckOutDate: effectiveCheckOutDate,
      hotelCheckInHour,
      hotelCheckOutHour,
      participants,
      customPhotoUrl,
      isPhotoRemoved,
      scannedDocuments,
    });

    setIsCreatingBlank(false);
    if (res.error) {
      setBlankError(res.error);
      onBlankSubmitError?.(res.error);
    } else if (res.tripId) {
      setBlankSuccess(t('engine.blank_trip_created_msg'));
    }
  };

  // Handle Personalized Trip Submission
  const handlePersonalizedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demoLockedSubmit) return;
    if (!destination.trim()) {
      setBlankError(t('engine.err_destination_required'));
      return;
    }
    if (!personalizedPrompt.trim()) {
      setBlankError(t('engine.personalized_prompt_placeholder'));
      return;
    }
    if (!startDate || !endDate) {
      setBlankError(t('engine.err_dates_required'));
      return;
    }
    const today = formatLocalIsoDate(new Date());
    if (startDate < today) {
      setBlankError(t('engine.err_start_before_today', { startDate, today }));
      return;
    }
    if (endDate < startDate) {
      setBlankError(t('engine.err_end_before_start'));
      return;
    }
    const rawCheckIn = hotelCheckInDate || startDate;
    const rawCheckOut = hotelCheckOutDate || endDate;
    if (rawCheckOut < rawCheckIn) {
      setBlankError(t('engine.err_checkout_before_checkin'));
      return;
    }
    const effectiveCheckInDate = rawCheckIn < startDate ? startDate : (rawCheckIn > endDate ? endDate : rawCheckIn);
    const effectiveCheckOutDate = rawCheckOut > endDate ? endDate : (rawCheckOut < effectiveCheckInDate ? effectiveCheckInDate : rawCheckOut);
    if (!participants || participants.length === 0) {
      setBlankError(t('engine.err_participant_required'));
      return;
    }
    clearErrors();

    const numericBudget =
      budgetUsd !== '' && Number.isFinite(Number(budgetUsd))
        ? Math.max(0, Number(budgetUsd))
        : 1500;
    const coverPhotoPayload = !isPhotoRemoved && customPhotoUrl ? customPhotoUrl : undefined;
    const hasCustomHotelAnchor = Boolean(
      hotelArea.trim() ||
        (hotelCheckInDate && hotelCheckInDate !== startDate) ||
        (hotelCheckOutDate && hotelCheckOutDate !== endDate) ||
        (hotelCheckInHour && hotelCheckInHour !== '15:00') ||
        (hotelCheckOutHour && hotelCheckOutHour !== '11:00')
    );
    const hotelPayload = hasCustomHotelAnchor
      ? {
          name: hotelArea.trim() || t('engine.accommodation_hotel_fallback'),
          address: hotelAddress || undefined,
          lat: hotelLat,
          lng: hotelLng,
          check_in_date: effectiveCheckInDate,
          check_in_time: hotelCheckInHour || '15:00',
          check_out_date: effectiveCheckOutDate,
          check_out_time: hotelCheckOutHour || '11:00',
        }
      : undefined;

    const extras: Record<string, unknown> = {
      auto_verify: true,
      test_mode: anchorMode === 'simulated',
      plan_mode: 'estimated',
      title: tripTitle.trim() || t('engine.trip_to_destination', { destination: destination.trim() }),
      description: tripDescription.trim() || undefined,
      ...(coverPhotoPayload ? { cover_photo: coverPhotoPayload } : {}),
      booking_text: anchorMode === 'direct' ? rawBookingText : undefined,
      scanned_documents: scannedDocuments,
      origin_city: origin.trim() || undefined,
      origin_iata: originIata.trim().toUpperCase() || undefined,
      destination_city: destination.trim(),
      destination_iata: destIata.trim().toUpperCase() || undefined,
      start_date: startDate,
      end_date: endDate,
      departure_hour: departureHour,
      arrival_hour: arrivalHour,
      budget: numericBudget,
      budget_usd: numericBudget,
      currency: currency,
      travelers: travelersCount,
      participants: participants.map((p) => ({
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        email: p.email,
        is_guest: p.is_guest,
      })),
      meals,
      accommodation: hotelArea.trim() || undefined,
      hotel: hotelPayload,
      manual_constraints: {
        plan_mode: 'estimated',
        title: tripTitle.trim() || t('engine.trip_to_destination', { destination: destination.trim() }),
        description: tripDescription.trim() || undefined,
        origin_city: origin.trim() || undefined,
        origin_iata: originIata.trim().toUpperCase() || undefined,
        destination_city: destination.trim(),
        destination_iata: destIata.trim().toUpperCase() || undefined,
        budget: numericBudget,
        budget_usd: numericBudget,
        currency: currency,
        travelers: travelersCount,
        participants: participants.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          is_guest: p.is_guest,
        })),
        departure_hour: departureHour,
        arrival_hour: arrivalHour,
        accommodation: hotelArea.trim() || undefined,
        hotel: hotelPayload,
        meals,
      },
    };
    onPersonalizedSubmit(personalizedPrompt, extras);
  };

  const promptPresets = useMemo(
    () => [
      { label: t('engine.preset_arch_label'), icon: 'museum', text: t('engine.preset_arch_text') },
      { label: t('engine.preset_gastro_label'), icon: 'gastronomy', text: t('engine.preset_gastro_text') },
      { label: t('engine.preset_hidden_label'), icon: 'compass', text: t('engine.preset_hidden_text') },
      { label: t('engine.preset_fast_label'), icon: 'lightning', text: t('engine.preset_fast_text') },
    ],
    [t]
  );

  return (
    <div style={{ width: '100%', maxWidth: '1280px', margin: '0 auto' }}>
      {/* ================= MAIN TRIP CREATION CARD ================= */}
      <div
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border)',
          borderRadius: '28px',
          padding: '2rem',
          boxShadow: 'var(--shadow-sm, 0 4px 24px rgba(0,0,0,0.04))',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          animation: 'fadeInSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Header Row: Dual Segmented Switchers */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: '1.25rem',
          }}
        >
          {/* Mode Segmented Capsule (Google Wi-Fi / Starlink style) */}
          <div
            style={{
              display: 'inline-flex',
              padding: '4px',
              borderRadius: '9999px',
              background: 'var(--color-bg-main, #F0F2F4)',
              border: '1px solid var(--color-border)',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedMode('personalized')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9999px',
                border: 'none',
                background: selectedMode === 'personalized' ? 'var(--color-accent-primary, #0F4C5C)' : 'transparent',
                color: selectedMode === 'personalized' ? '#FFFFFF' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <StarIcon size={14} color={selectedMode === 'personalized' ? '#FFFFFF' : 'currentColor'} />
              <span>{t('engine.personalized_trip_mode')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode('blank')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9999px',
                border: 'none',
                background: selectedMode === 'blank' ? 'var(--color-accent-primary, #0F4C5C)' : 'transparent',
                color: selectedMode === 'blank' ? '#FFFFFF' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <DocumentIcon size={14} color={selectedMode === 'blank' ? '#FFFFFF' : 'currentColor'} />
              <span>{t('engine.blank_trip_mode')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Upload Documents Trigger Button */}
            <button
              type="button"
              onClick={() => setIsDocModalOpen(true)}
              disabled={disabled}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9999px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised, #FFFFFF)',
                color: 'var(--color-text-primary)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent-primary, #0F4C5C)';
                e.currentTarget.style.color = 'var(--color-accent-primary, #0F4C5C)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
            >
              <PlusIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
              <span>{t('engine.upload_documents_btn')}</span>
            </button>
          </div>
        </div>

        {/* ================= SIDE-BY-SIDE MAIN WORKSPACE ================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1.75rem',
            alignItems: 'start',
          }}
        >
          {/* Column A (Left): Visual Hero + Flights Bar + Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Dynamic Travel Hero Banner */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '170px',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                background: currentPhoto
                  ? 'var(--color-bg-main, #F0F2F4)'
                  : 'linear-gradient(135deg, #1C2028 0%, #111317 100%)',
              }}
            >
              {currentPhoto && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhoto}
                    alt={destination || t('engine.travel_destination_alt')}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: 'brightness(0.85)',
                      transition: 'all 0.4s ease',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
                    }}
                  />
                </>
              )}

              {/* Top-Right Upload Photo Trigger Button & Remove Cross */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  zIndex: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  title={t('engine.upload_own_photo_title')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(0, 0, 0, 0.55)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '9999px',
                    padding: '5px 12px',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PaperclipIcon size={12} color="#FFFFFF" />
                  <span>{t('workspace.upload_photo')}</span>
                </button>

                {currentPhoto ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPhotoRemoved(true);
                      setCustomPhotoUrl('');
                    }}
                    title={t('engine.remove_photo_title')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.55)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPhotoRemoved(false);
                      setCustomPhotoUrl('');
                    }}
                    title={t('engine.restore_default_photo_title')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      background: 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('engine.reset_btn')}
                  </button>
                )}
              </div>

              {/* Editable Title Pill over Image */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  right: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    flex: 1,
                  }}
                >
                  <PinIcon size={15} color="#0F4C5C" />
                  <input
                    type="text"
                    value={tripTitle}
                    onChange={(e) => setTripTitle(e.target.value)}
                    placeholder={
                      destination.trim()
                        ? t('engine.trip_to_destination', { destination: destination.trim() })
                        : t('engine.trip_to_europe_placeholder')
                    }
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827',
                      marginLeft: '8px',
                      width: '100%',
                    }}
                  />
                </div>

                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(8px)',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {destination ? destination.toUpperCase() : t('engine.destination_upper')}
                </span>
              </div>
            </div>

            {/* Trip Description Input directly below Title & Photo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--color-bg-main, #FAF8F5)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                padding: '8px 14px',
              }}
            >
              <DocumentIcon size={14} color="var(--color-text-muted)" />
              <input
                type="text"
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                placeholder={t('engine.trip_description_placeholder')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>



            {/* Flight Route & Time Windows */}
            <div>
              <div
                style={{
                  marginBottom: '6px',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {t('engine.flight_route_time_windows')}
                </label>
              </div>
              <RouteIntakeBar
                origin={origin}
                destination={destination}
                originIata={originIata}
                destIata={destIata}
                onOriginIataChange={setOriginIata}
                onDestIataChange={setDestIata}
                departureHour={departureHour}
                arrivalHour={arrivalHour}
                startDate={startDate}
                endDate={endDate}
                onOriginChange={setOrigin}
                onDestinationChange={setDestination}
                onDepartureHourChange={setDepartureHour}
                onArrivalHourChange={setArrivalHour}
                disabled={disabled}
              />
            </div>

            {/* Hotel / Stay Anchor Section (Available for both Personalized and Blank Trips) */}
            <HotelStayAnchorBar
              hotelArea={hotelArea}
              hotelAddress={hotelAddress}
              hotelLat={hotelLat}
              hotelLng={hotelLng}
              destination={destination}
              checkInDate={startDate}
              checkOutDate={endDate}
              checkInHour={hotelCheckInHour}
              checkOutHour={hotelCheckOutHour}
              tripStartDate={startDate}
              tripEndDate={endDate}
              onCheckInHourChange={setHotelCheckInHour}
              onCheckOutHourChange={setHotelCheckOutHour}
              onChange={setHotelInfo}
              disabled={disabled}
            />

            {/* Parameters: Budget Pill + Travelers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Budget Pill with Currency Wheel Picker Button */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  {t('engine.budget_envelope')}
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--color-bg-main, #FAF8F5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '6px 12px 6px 16px',
                  }}
                >
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={budgetUsd}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        setBudgetUsd('');
                        return;
                      }
                      const num = Number(e.target.value);
                      if (Number.isFinite(num)) {
                        setBudgetUsd(Math.max(0, num));
                      }
                    }}
                    placeholder="1500"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  />

                  {/* Currency Spin Dial Trigger Capsule */}
                  <button
                    type="button"
                    data-testid="engine-currency-dial-btn"
                    onClick={() => setIsCurrencyWheelOpen(true)}
                    title={t('engine.change_currency_dial_title')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--color-surface-raised, #FFFFFF)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '9999px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <FlagIcon countryCode={getCurrencyInfo(currency).flag} size={15} />
                    <span>{currency}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                      ({getCurrencyInfo(currency).symbol})
                    </span>
                    <SettingsIcon size={12} color="var(--color-text-muted)" />
                  </button>
                </div>
              </div>

              {/* Travelers & Participants Manager */}
              <div style={{ flex: 1, minWidth: '220px' }}>
                <ParticipantsManager
                  participants={participants}
                  onChange={setParticipants}
                  disabled={disabled}
                  currentUserId={currentUser?.id}
                />
              </div>
            </div>
          </div>

          {/* Column B (Right): 2-Month Calendar Side-by-Side + Execution Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, width: '100%' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-muted)',
              }}
            >
              {t('engine.travel_window_calendar')}
            </label>
            <PaladioDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                updateDraft({
                  startDate: start,
                  endDate: end,
                  hotelCheckInDate: start,
                  hotelCheckOutDate: end,
                });
              }}
              disabled={disabled}
              inline={true}
            />

            {/* Feedback / Error Notifications */}
            {activeError && (
              <div
                role="alert"
                style={{
                  background: 'rgba(179, 38, 30, 0.08)',
                  border: '1px solid rgba(179, 38, 30, 0.2)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-danger, #B3261E)',
                }}
              >
                {activeError}
              </div>
            )}
            {blankSuccess && (
              <div
                style={{
                  background: 'rgba(31, 122, 77, 0.08)',
                  border: '1px solid rgba(31, 122, 77, 0.2)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-success, #1F7A4D)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckIcon size={14} color="var(--color-success, #1F7A4D)" /> {blankSuccess}
              </div>
            )}

            {/* Submit Action Button */}
            <div>
              {!demoLockedSubmit && status === 'disconnected' && selectedMode === 'personalized' && (
                <div
                  style={{
                    marginBottom: '10px',
                    padding: '8px 14px',
                    background: 'rgba(217, 119, 6, 0.08)',
                    border: '1px solid rgba(217, 119, 6, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-accent-warning, #D97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{t('engine.gateway_uplink_offline')}</span>
                  {onReconnect && (
                    <button
                      type="button"
                      onClick={onReconnect}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-accent-warning, #D97706)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '12px',
                        textDecoration: 'underline',
                      }}
                    >
                      {t('engine.retry_now')}
                    </button>
                  )}
                </div>
              )}
              {demoLockedSubmit ? (
                <DemoLockedButton
                  fullWidth
                  label={t('demo.btn_create_trip_locked')}
                  tooltip={t('demo.locked_engine_create')}
                />
              ) : selectedMode === 'personalized' ? (
                <button
                  type="button"
                  onClick={handlePersonalizedSubmit}
                  disabled={disabled}
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: disabled ? 'var(--color-text-muted)' : 'var(--color-accent-primary, #0F4C5C)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                  }}
                >
                  <StarIcon size={15} color="#FFFFFF" />
                  <span>{t('engine.generate_sovereign_trip_plan')}</span>
                  <ArrowRightIcon size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateBlankTrip}
                  disabled={isCreatingBlank || disabled}
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: isCreatingBlank ? 'var(--color-text-muted)' : 'var(--color-accent-primary, #0F4C5C)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isCreatingBlank ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                  }}
                >
                  {isCreatingBlank ? (
                    <>
                      <Spinner size={16} color="#FFFFFF" />
                      {t('engine.creating_blank_trip_seeding')}
                    </>
                  ) : (
                    <>
                      <DocumentIcon size={15} color="#FFFFFF" />
                      <span>{t('engine.create_blank_canvas_trip')}</span>
                      <ArrowRightIcon size={14} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= FULL-WIDTH BOTTOM INTENT & SUBMISSION ================= */}
        {selectedMode === 'personalized' && (
          <div
            style={{
              background: 'var(--color-bg-main, #FAF8F5)',
              border: '1px solid var(--color-border)',
              borderRadius: '20px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1.5px dashed var(--color-border)',
              marginTop: '0.5rem',
            }}
          >
            <div>
              <span className="font-mono text-xs text-muted" style={{ fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {t('engine.describe_ideal_trip')}
              </span>
            </div>
            <textarea
              rows={2}
              value={personalizedPrompt}
              onChange={(e) => setPersonalizedPrompt(e.target.value)}
              placeholder={t('engine.personalized_prompt_placeholder')}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                fontFamily: 'var(--font-sans)',
                fontSize: '13.5px',
                color: 'var(--color-text-primary)',
                resize: 'none',
                lineHeight: 1.5,
              }}
            />
            {/* Preset Chips with Clean SVG Icons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
              {promptPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPersonalizedPrompt(preset.text)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'var(--color-surface-raised, #FFFFFF)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {preset.icon === 'museum' && <BulbIcon size={12} color="#0F4C5C" />}
                  {preset.icon === 'gastronomy' && <StarIcon size={12} color="#D42A2F" />}
                  {preset.icon === 'compass' && <CompassIcon size={12} color="#2563EB" />}
                  {preset.icon === 'lightning' && <LightningIcon size={12} color="#EAB308" />}
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Currency Wheel Picker Modal */}
      <CurrencyWheelPicker
        isOpen={isCurrencyWheelOpen}
        onClose={() => setIsCurrencyWheelOpen(false)}
        selectedCurrency={currency}
        onSelectCurrency={(cur: CurrencyInfo) => setCurrency(cur.code)}
        defaultCurrency={systemCurrency}
      />

      {/* Cover Photo Upload Modal */}
      <PhotoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onPhotoSelect={handlePhotoSelect}
      />

      {/* Document Upload Modal (Boarding Passes & Hotels) */}
      <DocumentUploadModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        onExtracted={handleExtracted}
        disabled={disabled}
      />
    </div>
  );
}

