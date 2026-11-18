"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTrips } from '@/hooks/useTrips';
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
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { getCurrencyInfo, CurrencyInfo } from '@/utils/currencyResolver';
import { ParticipantsManager, SelectedParticipant } from './ParticipantsManager';
import { PhotoUploadModal } from './PhotoUploadModal';
import { getApiBaseUrl } from '@/utils/api';
import { resolveAirportIata } from '@/utils/airportResolver';

interface TripCreationBoxesProps {
  onPersonalizedSubmit: (prompt: string, extras: Record<string, unknown>) => void;
  onBlankSubmitStart?: (msg?: string) => void;
  disabled?: boolean;
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
  disabled = false,
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
  const router = useRouter();
  const { saveTrip } = useTrips();
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
    resetDraft,
    initializeWithUser,
  } = draft;

  const systemCurrency = (currentUser?.preferences?.default_currency as string) || 'EUR';

  // Initialize organizer from logged-in user
  useEffect(() => {
    if (currentUser) {
      initializeWithUser(currentUser);
    }
  }, [currentUser, initializeWithUser]);

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
      if (initialStartDate) updates.startDate = initialStartDate;
      if (initialEndDate) updates.endDate = initialEndDate;
      if (initialBudget) updates.budgetUsd = initialBudget;
      if (initialCurrency) updates.currency = initialCurrency;
      if (initialDepartureHour) updates.departureHour = initialDepartureHour;
      if (initialArrivalHour) updates.arrivalHour = initialArrivalHour;

      if (querySource === 'deal') {
        updates.hotelArea = initialHotelArea || '';
        updates.hotelAddress = initialHotelAddress || '';
        updates.hotelLat = undefined;
        updates.hotelLng = undefined;
        if (initialTravelers && initialTravelers > 1 && participants.length < initialTravelers) {
          const nextParticipants = [...participants];
          while (nextParticipants.length < initialTravelers) {
            const idx = nextParticipants.length + 1;
            nextParticipants.push({
              id: `deal-guest-${idx}`,
              name: `Guest ${idx}`,
              is_guest: true,
              is_organizer: false,
            });
          }
          updates.participants = nextParticipants;
        }
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
      if (initialBudget && initialBudget !== budgetUsd) updates.budgetUsd = initialBudget;
      if (Object.keys(updates).length > 0) {
        updateDraft(updates);
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
  const setBudgetUsd = (val: number) => updateDraft({ budgetUsd: val });
  const setCurrency = (val: string) => updateDraft({ currency: val });
  const setTripTitle = (val: string) => updateDraft({ tripTitle: val });
  const setTripDescription = (val: string) => updateDraft({ tripDescription: val });
  const setHotelArea = (val: string) => updateDraft({ hotelArea: val });
  const setHotelInfo = (
    name: string,
    extra?: { address?: string; lat?: number; lng?: number }
  ) => {
    updateDraft({
      hotelArea: name,
      hotelAddress: extra?.address !== undefined ? extra.address : draft.hotelAddress,
      hotelLat: extra?.lat !== undefined ? extra.lat : draft.hotelLat,
      hotelLng: extra?.lng !== undefined ? extra.lng : draft.hotelLng,
    });
  };
  const setHotelCheckInDate = (val: string) => updateDraft({ hotelCheckInDate: val });
  const setHotelCheckOutDate = (val: string) => updateDraft({ hotelCheckOutDate: val });
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
    const today = new Date().toISOString().split('T')[0];
    if (data.departure_date && data.departure_date < today) {
      setBlankError(`Invalid travel pass: Departure date (${data.departure_date}) precedes today's date (${today}). Past dates cannot be used.`);
      return;
    }
    if (data.check_in_date && data.check_in_date < today) {
      setBlankError(`Invalid travel pass: Check-in date (${data.check_in_date}) precedes today's date (${today}). Past dates cannot be used.`);
      return;
    }
    setBlankError(null);

    if (data.origin_city) setOrigin(data.origin_city);
    else if (data.origin_iata) setOrigin(data.origin_iata);
    if (data.origin_iata) setOriginIata(data.origin_iata);

    if (data.destination_city) setDestination(data.destination_city);
    else if (data.destination_iata) setDestination(data.destination_iata);
    if (data.destination_iata) setDestIata(data.destination_iata);

    const hasScannedFlight = scannedDocuments.some((d) => d.ticket_type === 'flight');
    const isHotelOnly = data.document_type === 'hotel';

    if (data.departure_date && (!isHotelOnly || !hasScannedFlight)) {
      const start = data.departure_date;
      let end = data.return_date;
      if (!end) {
        const sDate = parseLocalIsoDate(start);
        sDate.setDate(sDate.getDate() + 5);
        end = formatLocalIsoDate(sDate);
      }
      setStartDate(start);
      setEndDate(end);
      if (!data.check_in_date && (!hotelCheckInDate || hotelCheckInDate === startDate)) {
        setHotelCheckInDate(start);
      }
      if (!data.check_out_date && (!hotelCheckOutDate || hotelCheckOutDate === endDate)) {
        setHotelCheckOutDate(end);
      }
    }

    // Only flight / trip_package docs update flight arrival/departure hours
    if (!isHotelOnly) {
      // Departure flight arrival time in destination sets trip start hour
      if (data.flight_arrival_hour) {
        setDepartureHour(data.flight_arrival_hour);
      } else if (data.departure_hour) {
        setDepartureHour(data.departure_hour);
      }

      // Return flight departure time in destination sets trip end hour
      if (data.return_departure_hour) {
        setArrivalHour(data.return_departure_hour);
      } else if (data.arrival_hour) {
        setArrivalHour(data.arrival_hour);
      }
    }

    // Hotel details and check-in / check-out constraints
    if (data.hotel_name || data.hotel_address) {
      setHotelInfo(data.hotel_name || hotelArea, {
        address: data.hotel_address || undefined,
      });
    }
    if (data.check_in_date) {
      setHotelCheckInDate(data.check_in_date);
    }
    if (data.check_out_date) {
      setHotelCheckOutDate(data.check_out_date);
    }
    if (data.check_in_hour) {
      setHotelCheckInHour(data.check_in_hour);
    }
    if (data.check_out_hour) {
      setHotelCheckOutHour(data.check_out_hour);
    }

    // Save full document draft(s) into state for later wallet persistence
    if (data.drafts && data.drafts.length > 0) {
      setScannedDocuments((prev) => [...prev, ...data.drafts!]);
    } else if (data.document_type === 'flight' || data.flight_number || data.carrier) {
      const depTime = data.departure_date
        ? `${data.departure_date}T${data.flight_departure_hour || data.departure_hour || '12:00'}:00`
        : undefined;
      const synthesized: TravelDocumentDraft = {
        ticket_type: 'flight',
        title: `${data.flight_number || 'Flight'} ${data.origin_iata || data.origin_city || 'Origin'} → ${data.destination_iata || data.destination_city || 'Destination'}`,
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
          departure_hour: data.flight_departure_hour || data.departure_hour,
        },
        field_confidence: {},
        warnings: [],
      };
      setScannedDocuments((prev) => [...prev, synthesized]);
    } else if (data.hotel_name) {
      const checkInTime = data.check_in_date
        ? `${data.check_in_date}T${data.check_in_hour || '15:00'}:00`
        : undefined;
      const checkOutTime = data.check_out_date
        ? `${data.check_out_date}T${data.check_out_hour || '11:00'}:00`
        : undefined;
      const synthesized: TravelDocumentDraft = {
        ticket_type: 'hotel',
        title: `${data.hotel_name} Stay`,
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
      setScannedDocuments((prev) => [...prev, synthesized]);
    }
  };

  // Handle Blank Trip Submission
  const handleCreateBlankTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) {
      setBlankError('Destination city is required.');
      return;
    }
    if (!startDate || !endDate) {
      setBlankError('Please select departure and return dates on the calendar.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (startDate < today) {
      setBlankError(`Trip departure date (${startDate}) cannot precede today's date (${today}).`);
      return;
    }
    if (endDate < startDate) {
      setBlankError('Trip return date cannot precede departure date.');
      return;
    }
    const effectiveCheckInDate = hotelCheckInDate || startDate;
    const effectiveCheckOutDate = hotelCheckOutDate || endDate;
    if (effectiveCheckOutDate < effectiveCheckInDate) {
      setBlankError('Hotel check-out date cannot precede check-in date.');
      return;
    }
    if (!participants || participants.length === 0) {
      setBlankError('At least one traveler or participant must be added to the trip.');
      return;
    }
    setBlankError(null);
    setIsCreatingBlank(true);
    onBlankSubmitStart?.('Creating blank trip workspace...');

    try {
      const start = parseLocalIsoDate(startDate);
      const parseHhmm = (val: string | undefined, fallbackMins: number): number => {
        if (!val) return fallbackMins;
        const parts = val.trim().split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
          return fallbackMins;
        }
        return h * 60 + m;
      };
      const fmtHhmm = (mins: number): string => {
        const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
        return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
      };

      const arrMins = parseHhmm(departureHour, 9 * 60);
      const depMins = parseHhmm(arrivalHour, 20 * 60);
      const cinMins = parseHhmm(hotelCheckInHour, 15 * 60);
      const coutMins = parseHhmm(hotelCheckOutHour, 11 * 60);

      // Dynamically resolve destination airport anchor
      let airportPoi: { id: string; name: string; city: string; category: string; duration_mins: number; cost_eur: number; location: { latitude: number; longitude: number } } | null = null;
      let effectiveIata = destIata.trim().toUpperCase();
      if (!effectiveIata) {
        effectiveIata = (await resolveAirportIata(destination.trim())) || '';
      }
      const baseUrl = getApiBaseUrl();
      let cityFallbackLat = 0;
      let cityFallbackLng = 0;
      try {
        const apRes = await fetch(`${baseUrl}/locations/resolve-airport?city=${encodeURIComponent(destination.trim())}`);
        if (apRes.ok) {
          const apData = await apRes.json();
          if (typeof apData?.latitude === 'number' && typeof apData?.longitude === 'number') {
            cityFallbackLat = apData.latitude;
            cityFallbackLng = apData.longitude;
          }
          if (apData?.iata) {
            effectiveIata = apData.iata;
            airportPoi = {
              id: `airport-${String(apData.iata).toLowerCase()}`,
              name: apData.name || `${apData.iata} Airport`,
              city: apData.city || destination.trim(),
              category: 'AIRPORT',
              duration_mins: 120,
              cost_eur: 0,
              location: {
                latitude: typeof apData.latitude === 'number' ? apData.latitude : 0,
                longitude: typeof apData.longitude === 'number' ? apData.longitude : 0,
              },
            };
          }
        }
      } catch {
        // fallback
      }
      if (!airportPoi) {
        airportPoi = {
          id: effectiveIata ? `airport-${effectiveIata.toLowerCase()}` : 'airport-dest',
          name: effectiveIata ? `${effectiveIata} Airport` : `${destination.trim()} Airport`,
          city: destination.trim(),
          category: 'AIRPORT',
          duration_mins: 120,
          cost_eur: 0,
          location: { latitude: cityFallbackLat, longitude: cityFallbackLng },
        };
      }

      // Dynamically resolve hotel anchor (always present for daily start/end anchors even on blank trips)
      let resolvedHotelLat = typeof hotelLat === 'number' ? hotelLat : 0;
      let resolvedHotelLng = typeof hotelLng === 'number' ? hotelLng : 0;
      if (resolvedHotelLat === 0 && resolvedHotelLng === 0) {
        try {
          const locQuery = hotelArea.trim()
            ? `${hotelArea.trim()} ${destination.trim()}`
            : destination.trim();
          const locRes = await fetch(`${baseUrl}/locations/search?q=${encodeURIComponent(locQuery)}&limit=1`);
          if (locRes.ok) {
            const locItems = await locRes.json();
            if (Array.isArray(locItems) && locItems.length > 0) {
              if (typeof locItems[0].latitude === 'number' && typeof locItems[0].longitude === 'number') {
                resolvedHotelLat = locItems[0].latitude;
                resolvedHotelLng = locItems[0].longitude;
              }
            }
          }
        } catch {
          // keep 0 or fallback to city airport coordinates resolved above
        }
        if (resolvedHotelLat === 0 && resolvedHotelLng === 0 && (cityFallbackLat !== 0 || cityFallbackLng !== 0)) {
          resolvedHotelLat = cityFallbackLat;
          resolvedHotelLng = cityFallbackLng;
        }
      }

      const hotelPoi = {
        id: 'hotel-base',
        name: hotelArea.trim() || 'Accommodation / Hotel',
        city: destination.trim(),
        category: 'HOTEL',
        duration_mins: 0,
        cost_eur: 0,
        location: {
          latitude: resolvedHotelLat,
          longitude: resolvedHotelLng,
        },
      };

      const days = [];
      for (let i = 1; i <= tripDurationDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + (i - 1));
        const dayDateStr = formatLocalIsoDate(d);
        const isCinDay = dayDateStr === effectiveCheckInDate;
        const isCoutDay = dayDateStr === effectiveCheckOutDate;

        let dayPath: Array<{
          poi: { id: string; name: string; city: string; category: string; duration_mins: number; cost_eur: number; location: { latitude: number; longitude: number } };
          scheduled_start?: string;
          scheduled_end?: string;
          arrival_time?: string;
          departure_time?: string;
        }> = [];

        if (tripDurationDays === 1) {
          const arrStart = arrMins;
          const depEnd = depMins > arrStart + 60
            ? depMins
            : Math.min(23 * 60 + 59, Math.max(arrStart + 120, depMins));
          const arrEnd = Math.min(arrStart + 60, Math.max(arrStart, depEnd - 60));
          let depStart = Math.max(arrEnd + 30, depEnd - 120);
          const midHotel = Math.max(arrEnd + 15, Math.min(cinMins, Math.max(arrEnd + 15, depStart - 15)));
          depStart = Math.max(midHotel + 15, depStart);
          dayPath = [
            { poi: airportPoi, scheduled_start: fmtHhmm(arrStart), scheduled_end: fmtHhmm(arrEnd), arrival_time: fmtHhmm(arrStart), departure_time: fmtHhmm(arrEnd) },
            { poi: hotelPoi, scheduled_start: fmtHhmm(midHotel), scheduled_end: fmtHhmm(midHotel), arrival_time: fmtHhmm(midHotel), departure_time: fmtHhmm(midHotel) },
            { poi: airportPoi, scheduled_start: fmtHhmm(depStart), scheduled_end: fmtHhmm(depEnd), arrival_time: fmtHhmm(depStart), departure_time: fmtHhmm(depEnd) },
          ];
        } else {
          if (i === 1) {
            const arrStart = arrMins;
            const arrEnd = Math.min(23 * 60 + 59, arrStart + 60);
            const hotelTime = isCinDay
              ? Math.max(Math.min(23 * 60 + 59, arrEnd + 30), cinMins)
              : Math.max(Math.min(23 * 60 + 59, arrEnd + 30), 21 * 60);
            dayPath = [
              { poi: airportPoi, scheduled_start: fmtHhmm(arrStart), scheduled_end: fmtHhmm(arrEnd), arrival_time: fmtHhmm(arrStart), departure_time: fmtHhmm(arrEnd) },
              { poi: hotelPoi, scheduled_start: fmtHhmm(hotelTime), scheduled_end: fmtHhmm(hotelTime), arrival_time: fmtHhmm(hotelTime), departure_time: fmtHhmm(hotelTime) },
            ];
          } else if (i === tripDurationDays) {
            const depEnd = depMins;
            const rawAirportStart = Math.max(0, depEnd - 120);
            const maxHotelDep = Math.max(0, rawAirportStart - 30);
            const hotelStart = isCoutDay
              ? Math.min(coutMins, maxHotelDep)
              : Math.min(9 * 60, maxHotelDep);
            const depStart = Math.max(depEnd >= hotelStart + 30 ? hotelStart + 30 : hotelStart, rawAirportStart);
            dayPath = [
              { poi: hotelPoi, scheduled_start: fmtHhmm(hotelStart), scheduled_end: fmtHhmm(hotelStart), arrival_time: fmtHhmm(hotelStart), departure_time: fmtHhmm(hotelStart) },
              { poi: airportPoi, scheduled_start: fmtHhmm(depStart), scheduled_end: fmtHhmm(depEnd), arrival_time: fmtHhmm(depStart), departure_time: fmtHhmm(depEnd) },
            ];
          } else {
            const mornTime = isCoutDay ? Math.min(9 * 60, coutMins) : 9 * 60;
            const eveTime = isCinDay ? Math.max(21 * 60, cinMins) : 21 * 60;
            dayPath = [
              { poi: hotelPoi, scheduled_start: fmtHhmm(mornTime), scheduled_end: fmtHhmm(mornTime), arrival_time: fmtHhmm(mornTime), departure_time: fmtHhmm(mornTime) },
              { poi: hotelPoi, scheduled_start: fmtHhmm(eveTime), scheduled_end: fmtHhmm(eveTime), arrival_time: fmtHhmm(eveTime), departure_time: fmtHhmm(eveTime) },
            ];
          }
        }

        days.push({
          day: i,
          date: dayDateStr,
          theme: `Day ${i} Exploration`,
          itinerary: {
            day_index: i - 1,
            path: dayPath,
            total_cost_eur: 0,
            total_time_mins: 0,
          },
          activities: dayPath.map((node) => node.poi).filter(Boolean),
        });
      }

      const outboundFlightDoc = scannedDocuments.find((d) => d.ticket_type === 'flight');
      const blankItineraryData = {
        title: tripTitle.trim() || `Trip to ${destination.trim()}`,
        destination: destination.trim(),
        origin: origin.trim() || undefined,
        description: tripDescription.trim() || undefined,
        departure_hour: departureHour || '09:00',
        arrival_hour: arrivalHour || '20:00',
        participants: participants.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          is_guest: p.is_guest,
        })),
        outbound_flight: outboundFlightDoc ? {
          airline: outboundFlightDoc.provider || undefined,
          flight_number: (outboundFlightDoc.metadata?.flight_number as string) || undefined,
          origin_iata: (outboundFlightDoc.metadata?.origin_iata as string) || originIata || undefined,
          destination_iata: (outboundFlightDoc.metadata?.destination_iata as string) || destIata || undefined,
          departure_time: outboundFlightDoc.start_time || `${startDate}T${departureHour || '09:00'}:00`,
          arrival_time: `${startDate}T${departureHour || '09:00'}:00`,
          seat: outboundFlightDoc.seat_or_room || undefined,
          pnr: outboundFlightDoc.reference_code || undefined,
          holder_name: outboundFlightDoc.holder_name || undefined,
        } : undefined,
        scanned_documents: scannedDocuments,
        hotel: {
          name: hotelPoi.name,
          address: hotelAddress || undefined,
          lat: hotelPoi.location.latitude,
          lng: hotelPoi.location.longitude,
          check_in_date: effectiveCheckInDate,
          check_in_time: hotelCheckInHour || '15:00',
          check_out_date: effectiveCheckOutDate,
          check_out_time: hotelCheckOutHour || '11:00',
        },
        airport: {
          name: airportPoi.name,
          lat: airportPoi.location.latitude,
          lng: airportPoi.location.longitude,
        },
        travel_constraints: {
          destination_city: destination.trim(),
          destination_iata: destIata.trim().toUpperCase() || effectiveIata || undefined,
          origin_city: origin.trim() || undefined,
          origin_iata: originIata.trim().toUpperCase() || undefined,
          start_date: startDate,
          end_date: endDate,
          departure_hour: departureHour || '09:00',
          arrival_hour: arrivalHour || '20:00',
          budget: Number(budgetUsd) || 1500,
          budget_usd: Number(budgetUsd) || 1500,
          currency: currency,
          travelers: travelersCount,
          participants: participants.map((p) => ({
            id: p.id,
            user_id: p.user_id,
            name: p.name,
            email: p.email,
            is_guest: p.is_guest,
          })),
          accommodation: hotelPoi.name,
          hotel: {
            name: hotelPoi.name,
            address: hotelAddress || undefined,
            lat: hotelPoi.location.latitude,
            lng: hotelPoi.location.longitude,
            check_in_date: effectiveCheckInDate,
            check_in_time: hotelCheckInHour || '15:00',
            check_out_date: effectiveCheckOutDate,
            check_out_time: hotelCheckOutHour || '11:00',
          },
        },
        days,
        is_blank_trip: true,
      };

      const startIso = new Date(startDate).toISOString();
      const endIso = new Date(endDate).toISOString();

      const createdTrip = await saveTrip({
        destination: destination.trim(),
        start_date: startIso,
        end_date: endIso,
        itinerary_data: blankItineraryData,
      });

      if (createdTrip?.id) {
        resetDraft();
        setBlankSuccess('Trip created! Seeding POIs & GTFS in background...');
        setTimeout(() => {
          router.push(`/trips/${createdTrip.id}`);
        }, 500);
      } else {
        throw new Error('Failed to create trip in database.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating blank trip.';
      setBlankError(msg);
      setIsCreatingBlank(false);
    }
  };

  // Handle Personalized Trip Submission
  const handlePersonalizedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalizedPrompt.trim()) return;
    if (!startDate || !endDate) {
      setBlankError('Please select departure and return dates on the calendar.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (startDate < today) {
      setBlankError(`Trip departure date (${startDate}) cannot precede today's date (${today}).`);
      return;
    }
    if (endDate < startDate) {
      setBlankError('Trip return date cannot precede departure date.');
      return;
    }
    const effectiveCheckInDate = hotelCheckInDate || startDate;
    const effectiveCheckOutDate = hotelCheckOutDate || endDate;
    if (effectiveCheckOutDate < effectiveCheckInDate) {
      setBlankError('Hotel check-out date cannot precede check-in date.');
      return;
    }
    if (!participants || participants.length === 0) {
      setBlankError('At least one traveler or participant must be added to the trip.');
      return;
    }
    setBlankError(null);

    const extras: Record<string, unknown> = {
      auto_verify: true,
      test_mode: anchorMode === 'simulated',
      plan_mode: 'estimated',
      title: tripTitle.trim() || `Trip to ${destination.trim()}`,
      description: tripDescription.trim() || undefined,
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
      budget: Number(budgetUsd) || 1500,
      budget_usd: Number(budgetUsd) || 1500,
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
      hotel: hotelArea.trim() ? {
        name: hotelArea.trim(),
        address: hotelAddress || undefined,
        lat: hotelLat,
        lng: hotelLng,
        check_in_date: effectiveCheckInDate,
        check_in_time: hotelCheckInHour || '15:00',
        check_out_date: effectiveCheckOutDate,
        check_out_time: hotelCheckOutHour || '11:00',
      } : undefined,
      manual_constraints: {
        plan_mode: 'estimated',
        title: tripTitle.trim() || `Trip to ${destination.trim()}`,
        description: tripDescription.trim() || undefined,
        origin_city: origin.trim() || undefined,
        origin_iata: originIata.trim().toUpperCase() || undefined,
        destination_city: destination.trim(),
        destination_iata: destIata.trim().toUpperCase() || undefined,
        budget: Number(budgetUsd) || 1500,
        budget_usd: Number(budgetUsd) || 1500,
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
        hotel: hotelArea.trim() ? {
          name: hotelArea.trim(),
          address: hotelAddress || undefined,
          lat: hotelLat,
          lng: hotelLng,
          check_in_date: effectiveCheckInDate,
          check_in_time: hotelCheckInHour || '15:00',
          check_out_date: effectiveCheckOutDate,
          check_out_time: hotelCheckOutHour || '11:00',
        } : undefined,
        meals,
      },
    };
    onPersonalizedSubmit(personalizedPrompt, extras);
  };

  const promptPresets = [
    { label: 'Architecture & Art', icon: 'museum', text: 'Focus on iconic architecture, world-class art museums, and historical landmarks.' },
    { label: 'Gastronomy & Cafes', icon: 'gastronomy', text: 'Highlight traditional local bistros, artisanal bakeries, cozy coffee shops, and authentic food markets.' },
    { label: 'Hidden Gems', icon: 'compass', text: 'Avoid large tourist queues. Prioritize charming hidden alleys, quiet parks, and neighborhood secrets.' },
    { label: 'Fast-Paced Route', icon: 'lightning', text: 'High-intensity efficient route covering maximum top sights with smooth transit connections.' },
  ];

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
              <span>Personalized Trip</span>
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
              <span>Blank Trip</span>
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
              <span>Upload Documents</span>
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
                    alt={destination || 'Travel destination'}
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
                  title="Upload your own trip photo"
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
                  <span>Upload Photo</span>
                </button>

                {currentPhoto ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPhotoRemoved(true);
                      setCustomPhotoUrl('');
                    }}
                    title="Remove photo altogether"
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
                    title="Restore default destination photo"
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
                    Reset
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
                    placeholder={destination.trim() ? `Trip to ${destination.trim()}` : 'Trip to Europe'}
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
                  {destination ? destination.toUpperCase() : 'DESTINATION'}
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
                placeholder="Trip description (e.g. Autumn photography journey through local neighborhoods)..."
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
                  Flight Route & Time Windows
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
              checkInDate={hotelCheckInDate || startDate}
              checkOutDate={hotelCheckOutDate || endDate}
              checkInHour={hotelCheckInHour}
              checkOutHour={hotelCheckOutHour}
              tripStartDate={startDate}
              tripEndDate={endDate}
              onCheckInDateChange={setHotelCheckInDate}
              onCheckOutDateChange={setHotelCheckOutDate}
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
                  Budget Envelope
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
                    onChange={(e) => setBudgetUsd(Number(e.target.value))}
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
                    onClick={() => setIsCurrencyWheelOpen(true)}
                    title="Change currency with dynamic spin dial"
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
              Travel Window & Calendar
            </label>
            <PaladioDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                const updates: Partial<typeof draft> = { startDate: start, endDate: end };
                if (!hotelCheckInDate || hotelCheckInDate === startDate || hotelCheckInDate < start || hotelCheckInDate > end) {
                  updates.hotelCheckInDate = start;
                }
                if (!hotelCheckOutDate || hotelCheckOutDate === endDate || hotelCheckOutDate > end || hotelCheckOutDate < start) {
                  updates.hotelCheckOutDate = end;
                }
                updateDraft(updates);
              }}
              disabled={disabled}
              inline={true}
            />

            {/* Feedback / Error Notifications */}
            {blankError && (
              <div
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
                {blankError}
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

            {status === 'inferencing' && (
              <div
                style={{
                  padding: '12px 16px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '12px',
                  color: '#1E40AF',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Spinner size={16} color="#2563EB" />
                <span>Swarm inferencing & optimizing route in C++20...</span>
              </div>
            )}

            {/* Submit Action Button */}
            <div>
              {status === 'disconnected' && selectedMode === 'personalized' && (
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
                  <span>Gateway uplink offline (auto-reconnecting...)</span>
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
                      Retry Now
                    </button>
                  )}
                </div>
              )}
              {selectedMode === 'personalized' ? (
                <button
                  type="button"
                  onClick={handlePersonalizedSubmit}
                  disabled={disabled || status === 'inferencing'}
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: status === 'inferencing' || disabled ? 'var(--color-text-muted)' : 'var(--color-accent-primary, #0F4C5C)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: status === 'inferencing' || disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                  }}
                >
                  {status === 'inferencing' ? (
                    <>
                      <Spinner size={16} color="#FFFFFF" />
                      Optimization In Progress...
                    </>
                  ) : (
                    <>
                      <StarIcon size={15} color="#FFFFFF" />
                      <span>Generate Sovereign Trip Plan</span>
                      <ArrowRightIcon size={14} />
                    </>
                  )}
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
                      Creating Blank Trip & Seeding POIs...
                    </>
                  ) : (
                    <>
                      <DocumentIcon size={15} color="#FFFFFF" />
                      <span>Create Blank Canvas Trip</span>
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
                Describe your ideal trip
              </span>
            </div>
            <textarea
              rows={2}
              value={personalizedPrompt}
              onChange={(e) => setPersonalizedPrompt(e.target.value)}
              placeholder="Describe your travel vision, desired rhythm, favorite cuisines, special interests, or specific stops..."
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

