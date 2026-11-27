"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { Trip, TripRevisionItem, useTrips } from '@/hooks/useTrips';
import type { RouteItineraryData } from '@/types/domain';
import { extractTripTitle } from '@/utils/tripParser';
import { apiFetch, resolveApiMediaUrl, sanitizeImageUrl } from '@/utils/api';
import { SanitizedImage } from '@/components/common/SanitizedImage';
import { notify } from '@/utils/notify';
import { useAuth } from '@/contexts/AuthContext';
import { PaladioDateRangePicker } from '@/components/trip-creation/PaladioDateRangePicker';
import { PaladioSingleDatePicker } from '@/components/trip-creation/PaladioSingleDatePicker';
import { ParticipantsManager, SelectedParticipant } from '@/components/trip-creation/ParticipantsManager';
import { PhotoUploadModal } from '@/components/trip-creation/PhotoUploadModal';
import { RouteIntakeBar } from '@/components/trip-creation/RouteIntakeBar';
import { HotelStayAnchorBar } from '@/components/trip-creation/HotelStayAnchorBar';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { CalendarIcon, PaperclipIcon, SettingsIcon } from '@/components/icons';
import { TripActivityTimeline } from '@/components/trip-workspace/TripActivityTimeline';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

interface TripConfigViewProps {
  trip: Trip;
  itinerary?: RouteItineraryData | null;
  onTripUpdated?: () => void;
}

const PACES = [
  { id: 'relaxed', labelKey: 'trip_config.pace_relaxed_label', descKey: 'trip_config.pace_relaxed_desc' },
  { id: 'balanced', labelKey: 'trip_config.pace_balanced_label', descKey: 'trip_config.pace_balanced_desc' },
  { id: 'packed', labelKey: 'trip_config.pace_packed_label', descKey: 'trip_config.pace_packed_desc' },
];

function extractPhotoUrl(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.src === 'string') return obj.src;
    if (typeof obj.path === 'string') return obj.path;
  }
  return '';
}

export function TripConfigView({ trip, onTripUpdated }: TripConfigViewProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    updateTrip,
    deleteTrip,
    addParticipant,
    removeParticipant,
    getTripRevisions,
    revertTripRevision,
    restoreTripVersion,
  } = useTrips();
  const { user: currentUser } = useAuth();

  // Extract initial values from trip and itinerary_data
  const itin = useMemo(() => {
    return (trip.itinerary_data || {}) as Record<string, any>;
  }, [trip.itinerary_data]);

  const travelConstraints = useMemo(() => {
    return (itin.travel_constraints || {}) as Record<string, any>;
  }, [itin]);

  // Form states
  const [title, setTitle] = useState(extractTripTitle(trip));
  const [destination, setDestination] = useState(trip.destination || '');
  const [origin, setOrigin] = useState(
    travelConstraints.origin_city || itin.origin || ''
  );
  const [originIata, setOriginIata] = useState(
    travelConstraints.origin_iata || itin.origin_iata || ''
  );
  const [destIata, setDestIata] = useState(
    travelConstraints.destination_iata || itin.destination_iata || ''
  );
  const [departureHour, setDepartureHour] = useState(
    travelConstraints.departure_hour || itin.departure_hour || '10:00'
  );
  const [arrivalHour, setArrivalHour] = useState(
    travelConstraints.arrival_hour || itin.arrival_hour || '18:00'
  );

  // Hotel Stay
  const [hotelArea, setHotelArea] = useState(
    travelConstraints.accommodation || itin.accommodation || itin.hotel?.name || ''
  );
  const [hotelAddress, setHotelAddress] = useState(itin.hotel?.address || '');
  const [hotelLat, setHotelLat] = useState<number | undefined>(itin.hotel?.lat);
  const [hotelLng, setHotelLng] = useState<number | undefined>(itin.hotel?.lng);
  const [hotelCheckInDate, setHotelCheckInDate] = useState(
    itin.hotel?.check_in_date || travelConstraints.hotel?.check_in_date || trip.start_date || ''
  );
  const [hotelCheckOutDate, setHotelCheckOutDate] = useState(
    itin.hotel?.check_out_date || travelConstraints.hotel?.check_out_date || trip.end_date || ''
  );
  const [hotelCheckInHour, setHotelCheckInHour] = useState(
    itin.hotel?.check_in_time || travelConstraints.hotel?.check_in_time || '15:00'
  );
  const [hotelCheckOutHour, setHotelCheckOutHour] = useState(
    itin.hotel?.check_out_time || travelConstraints.hotel?.check_out_time || '11:00'
  );
  const setHotelInfo = (
    name: string,
    extra?: { address?: string; lat?: number; lng?: number }
  ) => {
    setHotelArea(name);
    if (extra?.address !== undefined) setHotelAddress(extra.address);
    if (extra?.lat !== undefined) setHotelLat(extra.lat);
    if (extra?.lng !== undefined) setHotelLng(extra.lng);
  };

  const [startDate, setStartDate] = useState(trip.start_date || '');
  const [endDate, setEndDate] = useState(trip.end_date || '');
  const [description, setDescription] = useState(itin.description || '');
  const [notes, setNotes] = useState(itin.notes || '');
  const [budget, setBudget] = useState<string>(
    travelConstraints.budget_usd !== undefined
      ? String(travelConstraints.budget_usd)
      : itin.budget !== undefined
      ? String(itin.budget)
      : ''
  );
  const [currency, setCurrency] = useState(travelConstraints.currency || itin.currency || 'EUR');
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);
  const [pace, setPace] = useState(travelConstraints.pace || 'balanced');
  const [status, setStatus] = useState(trip.status || 'active');
  const [shiftStartDate, setShiftStartDate] = useState(trip.start_date || '');
  const [isShiftDatePickerOpen, setIsShiftDatePickerOpen] = useState(false);
  const [reanchorBookings, setReanchorBookings] = useState(true);
  const [isShiftingDates, setIsShiftingDates] = useState(false);
  const [isDuplicatingTrip, setIsDuplicatingTrip] = useState(false);

  const handleShiftTripDates = async () => {
    if (!trip.id || !shiftStartDate) return;
    setIsShiftingDates(true);
    try {
      const updated = await apiFetch<Trip>(`/trips/${trip.id}/shift-dates`, {
        method: 'POST',
        body: JSON.stringify({
          new_start_date: shiftStartDate,
          reanchor_bookings: reanchorBookings,
        }),
      });
      setStartDate(updated.start_date);
      setEndDate(updated.end_date);
      notify.success(
        t('trip_config.dates_shifted_title'),
        t('trip_config.dates_shifted_desc', { start: updated.start_date, end: updated.end_date })
      );
      onTripUpdated?.();
      await loadRevisions();
    } catch (err) {
      notify.error(
        t('trip_config.shift_failed_title'),
        err instanceof Error ? err.message : t('trip_config.shift_failed_msg')
      );
    } finally {
      setIsShiftingDates(false);
    }
  };

  const handleDuplicateTrip = async () => {
    if (!trip.id) return;
    setIsDuplicatingTrip(true);
    try {
      const cloned = await apiFetch<Trip>(`/trips/${trip.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      notify.success(t('trip_config.duplicated_title'), t('trip_config.duplicated_desc'));
      router.push(`/trips/${cloned.id}`);
    } catch (err) {
      notify.error(
        t('trip_config.duplicate_failed_title'),
        err instanceof Error ? err.message : t('trip_config.duplicate_failed_msg')
      );
    } finally {
      setIsDuplicatingTrip(false);
    }
  };

  // Photo state
  const initialPhoto = useMemo(() => {
    if (Array.isArray(itin.photos) && itin.photos.length > 0) {
      const first = extractPhotoUrl(itin.photos[0]);
      if (first) return first;
    }
    return extractPhotoUrl(itin.cover_photo) || extractPhotoUrl(itin.photo_url) || '';
  }, [itin]);

  const [photoUrl, setPhotoUrl] = useState(initialPhoto);
  const [photoPreviewError, setPhotoPreviewError] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  // Available photos from itinerary / POIs for quick picker
  const availablePhotos = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(itin.photos)) {
      itin.photos.forEach((p: unknown) => {
        const u = extractPhotoUrl(p);
        if (u && !list.includes(u)) list.push(u);
      });
    }
    if (Array.isArray(itin.days)) {
      itin.days.forEach((d: any) => {
        if (Array.isArray(d?.itinerary?.path)) {
          d.itinerary.path.forEach((stop: any) => {
            const url = extractPhotoUrl(stop?.poi?.photo_url);
            if (url && !list.includes(url)) {
              list.push(url);
            }
          });
        }
      });
    }
    return list;
  }, [itin]);

  // Duration calculation
  const durationText = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffTime = end.getTime() - start.getTime();
    const days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (days <= 0) return null;
    const nights = Math.max(0, days - 1);
    const daysLabel =
      days === 1 ? t('trip_config.day_singular', { count: days }) : t('trip_config.days_plural', { count: days });
    const nightsLabel =
      nights === 1
        ? t('trip_config.night_singular', { count: nights })
        : t('trip_config.nights_plural', { count: nights });
    return `${daysLabel} • ${nightsLabel}`;
  }, [startDate, endDate, t]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Activity timeline & revision history state
  const [revisions, setRevisions] = useState<TripRevisionItem[]>([]);
  const [currentRevision, setCurrentRevision] = useState<number>(trip.revision ?? 0);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [busyRevisionAction, setBusyRevisionAction] = useState<string | null>(null);
  const [showActivityPanel, setShowActivityPanel] = useState(true);

  const loadRevisions = async () => {
    if (!trip.id) return;
    setRevisionsLoading(true);
    setRevisionsError(null);
    try {
      const data = await getTripRevisions(trip.id);
      setRevisions(data.items || []);
      setCurrentRevision(data.current_revision ?? 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : translate('trip_config.load_history_failed');
      setRevisionsError(msg);
    } finally {
      setRevisionsLoading(false);
    }
  };

  useEffect(() => {
    const tripId = trip.id;
    if (!tripId) return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setRevisionsLoading(true);
      setRevisionsError(null);
      try {
        const data = await getTripRevisions(tripId);
        if (!cancelled) {
          setRevisions(data.items || []);
          setCurrentRevision(data.current_revision ?? 0);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : translate('trip_config.load_history_failed');
          setRevisionsError(msg);
        }
      } finally {
        if (!cancelled) {
          setRevisionsLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.revision, getTripRevisions]);

  // Synchronize configuration form fields whenever trip is updated externally (e.g. revert/restore)
  const [prevTripSync, setPrevTripSync] = useState(trip);
  if (trip !== prevTripSync) {
    setPrevTripSync(trip);
    setTitle(extractTripTitle(trip));
    setDestination(trip.destination || '');
    setOrigin(travelConstraints.origin_city || itin.origin || '');
    setOriginIata(travelConstraints.origin_iata || itin.origin_iata || '');
    setDestIata(travelConstraints.destination_iata || itin.destination_iata || '');
    setDepartureHour(travelConstraints.departure_hour || itin.departure_hour || '10:00');
    setArrivalHour(travelConstraints.arrival_hour || itin.arrival_hour || '18:00');
    setHotelArea(travelConstraints.accommodation || itin.accommodation || itin.hotel?.name || '');
    setHotelAddress(itin.hotel?.address || '');
    setHotelLat(itin.hotel?.lat);
    setHotelLng(itin.hotel?.lng);
    setHotelCheckInDate(itin.hotel?.check_in_date || travelConstraints.hotel?.check_in_date || trip.start_date || '');
    setHotelCheckOutDate(itin.hotel?.check_out_date || travelConstraints.hotel?.check_out_date || trip.end_date || '');
    setHotelCheckInHour(itin.hotel?.check_in_time || travelConstraints.hotel?.check_in_time || '15:00');
    setHotelCheckOutHour(itin.hotel?.check_out_time || travelConstraints.hotel?.check_out_time || '11:00');
    setStartDate(trip.start_date || '');
    setEndDate(trip.end_date || '');
    setShiftStartDate(trip.start_date || '');
    setDescription(itin.description || '');
    setNotes(itin.notes || '');
    setBudget(
      travelConstraints.budget_usd !== undefined
        ? String(travelConstraints.budget_usd)
        : itin.budget !== undefined
        ? String(itin.budget)
        : ''
    );
    setCurrency(travelConstraints.currency || itin.currency || 'EUR');
    setPace(travelConstraints.pace || 'balanced');
    setStatus(trip.status || 'active');
    setPhotoUrl(initialPhoto);
    setPhotoPreviewError(false);
    if (trip.revision !== undefined) {
      setCurrentRevision(trip.revision);
    }
  }

  const handleRevertRevision = async (revisionId: string) => {
    if (!trip.id) return;
    setBusyRevisionAction(`revert:${revisionId}`);
    setRevisionsError(null);
    try {
      await revertTripRevision(trip.id, revisionId);
      notify.success(t('trip_config.change_reverted_title'), t('trip_config.change_reverted_desc'));
      onTripUpdated?.();
      await loadRevisions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('trip_config.revert_failed_msg');
      setRevisionsError(msg);
      notify.error(t('trip_config.revert_failed_title'), msg);
    } finally {
      setBusyRevisionAction(null);
    }
  };

  const handleRestoreVersion = async (targetRevision: number) => {
    if (!trip.id) return;
    setBusyRevisionAction(`restore:${targetRevision}`);
    setRevisionsError(null);
    try {
      await restoreTripVersion(trip.id, targetRevision);
      notify.success(
        t('trip_config.version_restored_title'),
        t('trip_config.version_restored_desc', { revision: targetRevision })
      );
      onTripUpdated?.();
      await loadRevisions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('trip_config.restore_failed_msg');
      setRevisionsError(msg);
      notify.error(t('trip_config.restore_failed_title'), msg);
    } finally {
      setBusyRevisionAction(null);
    }
  };

  // Integrants / Participants state from trip
  const [participantsList, setParticipantsList] = useState<SelectedParticipant[]>(() => {
    return (trip.participants || []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email || undefined,
      user_id: p.user_id || undefined,
      is_guest: !p.user_id,
      is_organizer: p.role === 'organizer',
    }));
  });

  const [prevTripParticipants, setPrevTripParticipants] = useState(trip.participants);
  if (trip.participants !== prevTripParticipants) {
    setPrevTripParticipants(trip.participants);
    setParticipantsList(
      (trip.participants || []).map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email || undefined,
        user_id: p.user_id || undefined,
        is_guest: !p.user_id,
        is_organizer: p.role === 'organizer',
      }))
    );
  }

  const handleParticipantsChange = async (newParticipants: SelectedParticipant[]) => {
    if (!trip.id) return;
    const removed = participantsList.filter(
      (oldP) => !newParticipants.some((newP) => newP.id === oldP.id)
    );
    const added = newParticipants.filter(
      (newP) => !participantsList.some((oldP) => oldP.id === newP.id)
    );

    setParticipantsList(newParticipants);

    for (const r of removed) {
      await removeParticipant(trip.id, r.id);
    }
    for (const a of added) {
      await addParticipant(trip.id, {
        name: a.name,
        user_id: a.user_id,
        email: a.email,
        role: a.is_organizer ? 'organizer' : 'traveler',
      });
    }
    onTripUpdated?.();
    await loadRevisions();
  };

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Save General Configuration
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip.id) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const existingPhotos = Array.isArray(itin.photos) ? [...itin.photos] : [];
      let updatedPhotos = existingPhotos;
      if (photoUrl && photoUrl.trim()) {
        const cleanUrl = photoUrl.trim();
        updatedPhotos = [cleanUrl, ...existingPhotos.filter((p) => extractPhotoUrl(p) !== cleanUrl)];
      }

      const updatedTravelConstraints = {
        ...travelConstraints,
        title: title.trim(),
        destination_city: destination.trim(),
        destination_iata: destIata.trim().toUpperCase() || undefined,
        origin_city: origin.trim() || undefined,
        origin_iata: originIata.trim().toUpperCase() || undefined,
        departure_hour: departureHour,
        arrival_hour: arrivalHour,
        start_date: startDate,
        end_date: endDate,
        budget_usd: budget ? Number(budget) : undefined,
        currency: currency,
        pace: pace,
        accommodation: hotelArea.trim() || undefined,
        hotel: hotelArea.trim()
          ? {
              name: hotelArea.trim(),
              address: hotelAddress || undefined,
              lat: hotelLat,
              lng: hotelLng,
              check_in_date: hotelCheckInDate || startDate || undefined,
              check_in_time: hotelCheckInHour || '15:00',
              check_out_date: hotelCheckOutDate || endDate || undefined,
              check_out_time: hotelCheckOutHour || '11:00',
            }
          : undefined,
      };

      const updatedItinData = {
        ...itin,
        title: title.trim(),
        destination: destination.trim(),
        description: description.trim(),
        notes: notes.trim(),
        photos: updatedPhotos,
        cover_photo: photoUrl.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        currency: currency,
        travel_constraints: updatedTravelConstraints,
        hotel: hotelArea.trim()
          ? {
              name: hotelArea.trim(),
              address: hotelAddress || undefined,
              lat: hotelLat,
              lng: hotelLng,
              check_in_date: hotelCheckInDate || startDate || undefined,
              check_in_time: hotelCheckInHour || '15:00',
              check_out_date: hotelCheckOutDate || endDate || undefined,
              check_out_time: hotelCheckOutHour || '11:00',
            }
          : undefined,
      };

      const res = await updateTrip(trip.id, {
        destination: destination.trim() || title.trim(),
        start_date: startDate,
        end_date: endDate,
        status: status,
        itinerary_data: updatedItinData,
      });

      if (res) {
        setSaveSuccess(true);
        onTripUpdated?.();
        await loadRevisions();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(t('trip_config.save_failed_network'));
      }
    } catch (err: any) {
      setSaveError(err?.message || t('trip_config.save_failed_unexpected'));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Trip
  const handleDeleteTrip = async () => {
    if (!trip.id) return;
    setIsDeleting(true);
    try {
      await deleteTrip(trip.id);
      router.push('/dashboard');
    } catch {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div
      style={{
        padding: '1.75rem 2rem',
        maxWidth: '1460px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '2rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Left Column: Shifted Trip Configuration Controls */}
      <div
        style={{
          flex: '1 1 600px',
          minWidth: 0,
          maxWidth: showActivityPanel ? '920px' : '1040px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2.5rem',
        }}
      >
        {/* View Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="font-display" style={{ margin: 0, fontSize: '1.6rem', color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {t('trip_config.title')}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!showActivityPanel && (
              <button
                type="button"
                onClick={() => setShowActivityPanel(true)}
                data-testid="open-activity-panel-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '10px 16px',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                {t('trip_config.activity_history_btn')}
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                background: saveSuccess ? 'var(--color-accent-teal)' : 'var(--color-accent-primary)',
                color: 'var(--color-btn-primary-text, #fff)',
                border: 'none',
                borderRadius: '8px',
                fontFamily: 'var(--font-display, inherit)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: isSaving ? 'wait' : 'pointer',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s ease',
              }}
            >
              {isSaving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  {t('trip_config.saving_btn')}
                </>
              ) : saveSuccess ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t('trip_config.saved_btn')}
                </>
              ) : (
                t('trip_config.save_changes_btn')
              )}
            </button>
          </div>
        </div>

      {saveSuccess && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.1))',
            border: '1px solid var(--color-accent-teal, #2e7d32)',
            borderRadius: '10px',
            color: 'var(--color-accent-teal, #2e7d32)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {t('trip_config.save_success_banner')}
        </div>
      )}

      {saveError && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '10px',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
          }}
        >
          {t('trip_config.error_prefix', { error: saveError })}
        </div>
      )}

      {/* Section 1: Trip Identity, Route & Lodging Anchor */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label className="font-mono text-muted text-xs">{t('workspace.trip_title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('workspace.trip_title_placeholder')}
            style={{
              padding: '10px 14px',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border-input)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
            }}
          />
        </div>

        {/* Flight Route & Time Windows */}
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
            {t('trip_config.flight_route_label')}
          </label>
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
            onDestinationChange={(val) => {
              if (val.trim().toLowerCase() !== destination.trim().toLowerCase()) {
                setHotelArea('');
                setHotelAddress('');
                setHotelLat(undefined);
                setHotelLng(undefined);
              }
              setDestination(val);
            }}
            onDepartureHourChange={setDepartureHour}
            onArrivalHourChange={setArrivalHour}
            disabled={isSaving}
          />
        </div>

        {/* Hotel Stay Anchor */}
        <div>
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
            disabled={isSaving}
          />
        </div>
      </section>

      {/* Section 2: Cover Photo & Visual Media */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsPhotoModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <PaperclipIcon size={13} color="var(--color-accent-primary)" />
            <span>{t('workspace.upload_photo')}</span>
          </button>
          {photoUrl && (
            <button
              type="button"
              onClick={() => {
                setPhotoUrl('');
                setPhotoPreviewError(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-danger)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('trip_config.clear_cover_photo')}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Photo Preview Frame */}
          <div
            style={{
              width: '100%',
              height: '180px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {photoUrl && !photoPreviewError && sanitizeImageUrl(resolveApiMediaUrl(photoUrl)) ? (
              <SanitizedImage
                src={resolveApiMediaUrl(photoUrl)}
                alt={t('workspace.photo_preview')}
                onError={() => setPhotoPreviewError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)', margin: '0 auto 8px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <div className="font-mono text-muted text-xs">
                  {photoPreviewError ? t('trip_config.invalid_image_url') : t('trip_config.no_cover_photo')}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="font-mono text-muted text-xs">{t('workspace.image_url')}</label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => {
                  setPhotoUrl(e.target.value);
                  setPhotoPreviewError(false);
                }}
                placeholder="https://images.unsplash.com/..."
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-input)',
                  borderRadius: '8px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Quick Picker from Itinerary Waypoints */}
            {availablePhotos.length > 0 && (
              <div>
                <span className="font-mono text-muted text-xs" style={{ display: 'block', marginBottom: '6px' }}>
                  {t('trip_config.choose_from_media', { count: availablePhotos.length })}
                </span>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {availablePhotos.slice(0, 8).map((url, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        setPhotoUrl(url);
                        setPhotoPreviewError(false);
                      }}
                      style={{
                        flexShrink: 0,
                        width: '54px',
                        height: '54px',
                        borderRadius: '6px',
                        border: photoUrl === url ? '2px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                        backgroundImage: `url(${resolveApiMediaUrl(url)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      title={t('workspace.use_photo')}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <PhotoUploadModal
          isOpen={isPhotoModalOpen}
          onClose={() => setIsPhotoModalOpen(false)}
          onPhotoSelect={(dataUrl) => {
            setPhotoUrl(dataUrl);
            setPhotoPreviewError(false);
            setIsPhotoModalOpen(false);
          }}
        />
      </section>

      {/* Section 3: Narrative & Field Briefing */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">{t('workspace.trip_description')}</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('workspace.trip_desc_placeholder')}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">{t('trip_config.internal_notes_label')}</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workspace.field_briefing_placeholder')}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </section>

      {/* Section 4: Budget, Currency & Financial Bounds */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">{t('trip_config.target_budget_label')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min="0"
                step="50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={t('trip_config.budget_placeholder')}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-input)',
                  borderRadius: '8px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                }}
              />
            </div>
            <span className="font-mono text-muted text-xs">{t('trip_config.target_budget_hint')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">{t('trip_config.base_currency_label')}</label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                minHeight: '44px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FlagIcon countryCode={getCurrencyInfo(currency).flag} size={18} />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                  {currency}
                </span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  ({getCurrencyInfo(currency).symbol}) {getCurrencyInfo(currency).name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCurrencyWheelOpen(true)}
                title={t('trip_config.change_currency_title')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <span>{t('trip_config.change_btn')}</span>
                <SettingsIcon size={12} color="var(--color-text-muted)" />
              </button>
            </div>
            <span className="font-mono text-muted text-xs">{t('trip_config.base_currency_hint')}</span>
          </div>
        </div>

        <CurrencyWheelPicker
          isOpen={isCurrencyWheelOpen}
          onClose={() => setIsCurrencyWheelOpen(false)}
          selectedCurrency={currency}
          onSelectCurrency={(c) => {
            setCurrency(c);
            setIsCurrencyWheelOpen(false);
          }}
        />
      </section>

      {/* Section 5: Timeline & Travel Tempo */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {durationText && (
            <span
              className="font-mono"
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
              }}
            >
              {durationText}
            </span>
          )}
        </div>

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
            {t('trip_config.travel_window_label')}
          </label>
          <PaladioDateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
            inline={true}
            disabled={isSaving}
            excludeTripId={trip.id}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label className="font-mono text-muted text-xs">{t('trip_config.exploration_pace_label')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {PACES.map((p) => {
              const active = pace === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPace(p.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    textAlign: 'left',
                    background: active ? 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.08))' : 'var(--color-bg-main)',
                    border: active ? '1.5px solid var(--color-accent-teal, #2e7d32)' : '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: active ? 'var(--color-accent-teal, #2e7d32)' : 'var(--color-text-primary)' }}>
                    {t(p.labelKey)}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    {t(p.descKey)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 6: Integrants & Crew Roster */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <ParticipantsManager
          participants={participantsList}
          onChange={handleParticipantsChange}
          disabled={isSaving}
          currentUserId={currentUser?.id}
        />
      </section>

      {/* Section 7: Status & Lifecycle */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'active', label: t('trip_config.status_active_label'), desc: t('trip_config.status_active_desc') },
            { id: 'completed', label: t('trip_config.status_completed_label'), desc: t('trip_config.status_completed_desc') },
            { id: 'archived', label: t('trip_config.status_archived_label'), desc: t('trip_config.status_archived_desc') },
          ].map((s) => {
            const active = status === s.id;
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => setStatus(s.id)}
                style={{
                  flex: '1 1 200px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  textAlign: 'left',
                  background: active ? 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.08))' : 'var(--color-bg-main)',
                  border: active ? '1.5px solid var(--color-accent-teal, #2e7d32)' : '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: active ? 'var(--color-accent-teal, #2e7d32)' : 'var(--color-text-primary)' }}>
                  {s.label}
                </div>
                <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 7.5: Shift Dates & Duplicate */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
              {t('trip_config.shift_dates_title')}
            </h4>
            <p className="font-mono text-muted text-xs" style={{ margin: '4px 0 0' }}>
              {t('trip_config.shift_dates_desc')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="shift-start-date-btn"
              onClick={() => setIsShiftDatePickerOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-main)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CalendarIcon size={14} color="var(--color-text-muted)" />
              <span>{shiftStartDate || t('trip_config.select_start_date')}</span>
            </button>
            {isShiftDatePickerOpen && typeof document !== 'undefined' && createPortal(
              <div
                className="paladio-modal-backdrop"
                onClick={() => setIsShiftDatePickerOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10050,
                  background: 'rgba(0, 0, 0, 0.28)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                }}
              >
                <div className="paladio-modal-panel" onClick={(e) => e.stopPropagation()}>
                  <PaladioSingleDatePicker
                    title={t('trip_config.new_start_date_title')}
                    selectedDate={shiftStartDate}
                    onChange={(d) => {
                      if (d) setShiftStartDate(d);
                      setIsShiftDatePickerOpen(false);
                    }}
                    onClose={() => setIsShiftDatePickerOpen(false)}
                  />
                </div>
              </div>,
              document.body
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={reanchorBookings}
                onChange={(e) => setReanchorBookings(e.target.checked)}
              />
              {t('trip_config.reanchor_checkbox')}
            </label>
            <button
              type="button"
              disabled={isShiftingDates || !shiftStartDate}
              onClick={handleShiftTripDates}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-accent-primary, #0F4C5C)',
                background: 'var(--color-accent-primary, #0F4C5C)',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isShiftingDates ? 'wait' : 'pointer',
              }}
            >
              {isShiftingDates ? t('trip_config.shifting_btn') : t('trip_config.shift_dates_btn')}
            </button>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />

        <DemoFeatureGate
          message={t('trip_config.demo_duplicate_disabled')}
          compact
          borderRadius="10px"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '10px 6px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                {t('trip_config.duplicate_title')}
              </h4>
              <p className="font-mono text-muted text-xs" style={{ margin: '4px 0 0' }}>
                {t('trip_config.duplicate_desc')}
              </p>
            </div>
            <button
              type="button"
              disabled={true}
              onClick={handleDuplicateTrip}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-main)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'not-allowed',
              }}
            >
              {t('trip_config.duplicate_btn')}
            </button>
          </div>
        </DemoFeatureGate>
      </section>

      {/* Section 8: Danger Zone */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-danger, #d32f2f)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div>
          <h4 style={{ margin: '4px 0 0', fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
            {t('trip_config.delete_section_title')}
          </h4>
          <p className="font-mono text-muted text-xs" style={{ margin: '4px 0 0' }}>
            {t('trip_config.delete_section_desc')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          style={{
            padding: '9px 18px',
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '6px',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {t('trip_config.delete_expedition_btn')}
        </button>
      </section>
      </div>

      {/* Right Column: Activity Timeline & Version Control */}
      {showActivityPanel && (
        <div
          style={{
            width: 'min(390px, 100%)',
            flex: '0 0 auto',
            position: 'sticky',
            top: '1.5rem',
          }}
        >
          <TripActivityTimeline
            items={revisions}
            currentRevision={currentRevision}
            loading={revisionsLoading}
            error={revisionsError}
            busyActionKey={busyRevisionAction}
            onRevertRevision={handleRevertRevision}
            onRestoreVersion={handleRestoreVersion}
            onRefresh={loadRevisions}
            onClose={() => setShowActivityPanel(false)}
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="paladio-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            className="paladio-modal-panel"
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-danger)',
              borderRadius: '14px',
              padding: '1.75rem',
              maxWidth: '460px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: 'var(--shadow-modal, 0 16px 40px rgba(0,0,0,0.3))',
            }}
          >
            <div>
              <h3 className="font-display" style={{ margin: '6px 0 0', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
                {t('trip_config.confirm_delete_title', { name: title || destination })}
              </h3>
            </div>

            <p className="font-mono text-muted text-xs" style={{ margin: 0, lineHeight: 1.5 }}>
              {t('trip_config.confirm_delete_desc')}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>

              <button
                type="button"
                onClick={handleDeleteTrip}
                disabled={isDeleting}
                style={{
                  padding: '8px 18px',
                  background: 'var(--color-danger)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: isDeleting ? 'wait' : 'pointer',
                }}
              >
                {isDeleting ? t('trip_config.purging_btn') : t('trip_config.confirm_purge_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
