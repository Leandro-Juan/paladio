"use client";
import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { useTrips } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { extractDestination } from '@/utils/tripParser';
import { TripCreationBoxes } from '@/components/trip-creation/TripCreationBoxes';
import { useTripDraftStore } from '@/stores/tripDraftStore';
import { useLogStore } from '@/contexts/SocketContext';
import { ThinkingScreen } from '@/components/trip-creation/ThinkingScreen';

function getThinkingMessage(
  lastLog: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
  defaultMsg: string
): string {
  if (!lastLog) return defaultMsg;
  const upper = lastLog.toUpperCase();
  if (upper.includes('SAVING') || upper.includes('REDIRECTING')) return t('engine.thinking_saving');
  if (upper.includes('ITINERARY GENERATED')) return t('engine.thinking_finalizing');
  if (upper.includes('OPTIMIZING ROUTES') || upper.includes('C++ SOLVER')) return t('engine.thinking_optimizing');
  if (upper.includes('EXTRACTING_CONSTRAINTS') || upper.includes('CONSTRAINTS EXTRACTED')) return t('engine.thinking_constraints');
  if (upper.includes('SCRAPING_DYNAMIC_DATA') || upper.includes('FETCHING POIS')) return t('engine.thinking_scraping');
  if (upper.includes('ANALYZING_PROMPT') || upper.includes('ANALYZING USER')) return t('engine.thinking_analyzing');
  if (upper.includes('ROUTING_INTENT')) return t('engine.thinking_routing');
  if (upper.includes('VALIDATING TRIP')) return t('engine.thinking_validating');
  if (upper.includes('GUARDRAILS_PASSED')) return t('engine.thinking_guardrails_passed');
  if (upper.includes('GUARDRAILS')) return t('engine.thinking_guardrails');
  if (upper.includes('REVIEWING TRIP') || upper.includes('VERIFYING_CONSTRAINTS')) return t('engine.thinking_reviewing');
  if (upper.includes('BOOKING ANCHORS') || upper.includes('PARSING_TICKETS')) return t('engine.thinking_booking_anchors');
  if (upper.includes('INITIALIZING LANGGRAPH') || upper.includes('INITIALIZING')) return t('engine.thinking_initializing');
  if (upper.includes('UPLINK') || upper.includes('NETWORK') || upper.includes('TELEMETRY') || upper.includes('HEARTBEAT')) {
    return defaultMsg;
  }
  
  const cleaned = lastLog.replace(/^>\s*/, '').replace(/^\[.*?\]\s*/, '').trim();
  return cleaned.length > 3 ? cleaned : defaultMsg;
}

export default function EnginePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    status,
    itinerary,
    clearItinerary,
    verificationPayload,
    clearVerification,
    overlapWarning,
    clearOverlapWarning,
    guardrailAbort,
    clearGuardrailAbort,
    sendMessage,
    sendResume,
    connect,
  } = usePaladioSocket();
  const { saveTrip } = useTrips();
  const searchParams = useSearchParams();
  const queryDest = searchParams.get('destination') || undefined;
  const queryOrigin = searchParams.get('origin') || undefined;
  const queryOriginIata = searchParams.get('origin_iata') || undefined;
  const queryDestIata = searchParams.get('dest_iata') || undefined;
  const queryStart = searchParams.get('start_date') || undefined;
  const queryEnd = searchParams.get('end_date') || undefined;
  const rawBudgetParam = searchParams.get('budget');
  const parsedQueryBudget = rawBudgetParam !== null && rawBudgetParam !== '' ? Number(rawBudgetParam) : NaN;
  const queryBudget = Number.isFinite(parsedQueryBudget) && parsedQueryBudget >= 0 ? Math.round(parsedQueryBudget) : undefined;
  const queryCurrency = searchParams.get('currency') || undefined;
  const queryDepartureHour = searchParams.get('departure_hour') || undefined;
  const queryArrivalHour = searchParams.get('arrival_hour') || undefined;
  const queryHotelName = searchParams.get('hotel_name') || undefined;
  const queryHotelAddress = searchParams.get('hotel_address') || undefined;
  const rawTravelersParam = searchParams.get('travelers');
  const parsedQueryTravelers = rawTravelersParam !== null && rawTravelersParam !== '' ? Number(rawTravelersParam) : NaN;
  const queryTravelers = Number.isFinite(parsedQueryTravelers) ? Math.max(1, Math.round(parsedQueryTravelers)) : undefined;
  const querySource = searchParams.get('source') || undefined;
  const hasQueryPrefill = Boolean(
    queryDest ||
      queryOrigin ||
      queryOriginIata ||
      queryDestIata ||
      queryStart ||
      queryEnd ||
      queryBudget !== undefined ||
      queryCurrency ||
      queryDepartureHour ||
      queryArrivalHour ||
      queryHotelName ||
      queryHotelAddress ||
      queryTravelers !== undefined ||
      querySource
  );
  const queryPrefillKey = searchParams.toString();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blankCreationStatus, setBlankCreationStatus] = useState<string | null>(null);
  const [blankCreationError, setBlankCreationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const logs = useLogStore((state) => state.logs);
  const draft = useTripDraftStore();

  const isSavingRef = useRef(false);
  const savedTripIdRef = useRef<string | null>(null);
  const lastExtrasRef = useRef<Record<string, unknown>>({});

  const handlePrepSubmit = (prompt: string, extras: Record<string, unknown>) => {
    savedTripIdRef.current = null;
    isSavingRef.current = false;
    setIsSaving(false);
    setBlankCreationError(null);
    setIsSubmitting(true);
    clearItinerary();
    useLogStore.getState().clearLogs();
    lastExtrasRef.current = extras;
    const newThreadId = 'paladio_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    sendMessage(prompt, { ...extras, auto_verify: true, thread_id: newThreadId });
  };


  const handleSaveTrip = useCallback(async () => {
    if (!itinerary || isSavingRef.current || savedTripIdRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    const extras = lastExtrasRef.current;
    const extraDest = typeof extras.destination_city === 'string' && extras.destination_city.trim()
      ? extras.destination_city.trim()
      : '';
    const destination = extraDest || extractDestination(itinerary);
    let startDate = new Date();
    if (itinerary?.travel_constraints?.start_date) {
      const parsed = new Date(itinerary.travel_constraints.start_date);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    } else if (itinerary?.days?.[0]?.flight_info?.departure_time) {
      const parsed = new Date(itinerary.days[0].flight_info.departure_time);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }
    const daysLength = itinerary?.days?.length || 3;
    
    let endDate: Date | null = null;
    if (itinerary?.travel_constraints?.end_date) {
      const parsed = new Date(itinerary.travel_constraints.end_date);
      if (!isNaN(parsed.getTime())) endDate = parsed;
    }
    if (!endDate && itinerary?.days && itinerary.days.length > 0) {
      const lastDayFlight = itinerary.days[itinerary.days.length - 1]?.flight_info?.departure_time;
      if (lastDayFlight) {
        const parsed = new Date(lastDayFlight);
        if (!isNaN(parsed.getTime())) endDate = parsed;
      }
    }
    if (!endDate) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.max(0, daysLength - 1));
    }

    const existingConstraints = (itinerary.travel_constraints || {}) as Record<string, unknown>;
    const mergedConstraints: Record<string, unknown> = {
      ...existingConstraints,
      ...(extras.title ? { title: extras.title } : {}),
      ...(extras.description ? { description: extras.description } : {}),
      ...(extras.currency ? { currency: extras.currency } : {}),
      ...(extras.budget !== undefined ? { budget: extras.budget } : {}),
      ...(extras.budget_usd !== undefined ? { budget_usd: extras.budget_usd } : {}),
      ...(extras.travelers !== undefined ? { travelers: extras.travelers } : {}),
      ...(extras.origin_city ? { origin_city: extras.origin_city } : {}),
      ...(extras.origin_iata ? { origin_iata: extras.origin_iata } : {}),
      ...(extras.destination_city ? { destination_city: extras.destination_city } : {}),
      ...(extras.destination_iata ? { destination_iata: extras.destination_iata } : {}),
      ...(extras.departure_hour ? { departure_hour: extras.departure_hour } : {}),
      ...(extras.arrival_hour ? { arrival_hour: extras.arrival_hour } : {}),
      ...(extras.accommodation ? { accommodation: extras.accommodation } : {}),
      ...(extras.hotel ? { hotel: extras.hotel } : {}),
      ...(extras.participants ? { participants: extras.participants } : {}),
    };

    const rawItin = itinerary as unknown as Record<string, unknown>;
    const itineraryPayload = {
      ...itinerary,
      ...(extras.title && !rawItin.title ? { title: extras.title } : {}),
      ...(extras.description && !rawItin.description ? { description: extras.description } : {}),
      ...(extras.cover_photo && !rawItin.cover_photo ? { cover_photo: extras.cover_photo } : {}),
      ...(extras.origin_city && !rawItin.origin ? { origin: extras.origin_city } : {}),
      ...(extras.departure_hour && !rawItin.departure_hour ? { departure_hour: extras.departure_hour } : {}),
      ...(extras.arrival_hour && !rawItin.arrival_hour ? { arrival_hour: extras.arrival_hour } : {}),
      ...(extras.hotel && !rawItin.hotel ? { hotel: extras.hotel } : {}),
      ...(extras.participants && !rawItin.participants ? { participants: extras.participants } : {}),
      ...(extras.scanned_documents ? { scanned_documents: extras.scanned_documents } : {}),
      travel_constraints: mergedConstraints,
    };

    const saved = await saveTrip({
      destination: destination,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      itinerary_data: itineraryPayload
    });
    if (saved?.id) {
      useTripDraftStore.getState().resetDraft();
      savedTripIdRef.current = saved.id;
      clearItinerary();
      useLogStore.getState().clearLogs();
      setIsSaving(false);
      setIsSubmitting(false);
      router.push(`/trips/${saved.id}`);
    } else {
      isSavingRef.current = false;
      setIsSaving(false);
      setIsSubmitting(false);
    }
  }, [itinerary, saveTrip, router, clearItinerary]);

  // Clean up any stale itinerary or logs when mounting fresh
  useEffect(() => {
    clearItinerary();
    useLogStore.getState().clearLogs();
    savedTripIdRef.current = null;
    isSavingRef.current = false;
  }, [clearItinerary]);

  // Ensure WebSocket uplink is connected when entering Engine cockpit
  useEffect(() => {
    if (status === 'disconnected') {
      connect();
    }
  }, [status, connect]);

  // When personalized optimization finishes, auto-save and redirect to trip workspace
  useEffect(() => {
    if (isSubmitting && itinerary && !isSavingRef.current && !savedTripIdRef.current) {
      void handleSaveTrip();
    }
  }, [isSubmitting, itinerary, handleSaveTrip]);

  const isCreatingTrip = isSubmitting || status === 'inferencing' || isSaving || Boolean(blankCreationStatus);

  if (isCreatingTrip) {
    const lastLog = logs[logs.length - 1];
    const defaultThinkingMsg = t('engine.thinking_default');
    let thinkingMessage = defaultThinkingMsg;
    if (blankCreationStatus) {
      thinkingMessage = blankCreationStatus;
    } else if (isSaving) {
      thinkingMessage = t('engine.thinking_saving');
    } else {
      thinkingMessage = getThinkingMessage(lastLog, t, defaultThinkingMsg);
    }

    const destName = draft.destination || queryDest || t('engine.trip_fallback');
    const subMessage = t('engine.thinking_submessage', { destination: destName.toUpperCase() });

    const errorMessage = (status === 'error' && !guardrailAbort)
      ? (lastLog?.replace(/^>\s*/, '') || t('engine.unexpected_error'))
      : null;

    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '1.5rem 1rem' }}>
        <ThinkingScreen
          message={thinkingMessage}
          subMessage={subMessage}
          error={errorMessage}
          onDismissError={() => {
            setIsSubmitting(false);
            setBlankCreationStatus(null);
            clearVerification();
            clearItinerary();
            useLogStore.getState().clearLogs();
          }}
        />

        <Modal 
          isOpen={Boolean(guardrailAbort)}
          variant="danger"
          title={guardrailAbort?.title || t('engine.guardrails_abort_title')}
          message={t('engine.guardrails_abort_message')}
          confirmText={t('engine.dismiss_and_edit')}
          cancelText=""
          onConfirm={() => {
            setIsSubmitting(false);
            clearGuardrailAbort();
          }}
          onCancel={() => {
            setIsSubmitting(false);
            clearGuardrailAbort();
          }}
        >
          {guardrailAbort?.errors && guardrailAbort.errors.length > 0 && (
            <div style={{
              background: 'var(--color-danger-soft)',
              border: '1px solid var(--color-danger)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
                {t('engine.critical_violations')}
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-primary)' }}>
                {guardrailAbort.errors.map((err, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </Modal>

        <Modal 
          isOpen={Boolean(overlapWarning)}
          variant="warning"
          title={overlapWarning?.warning_title || t('engine.overlap_warning_title')}
          message={overlapWarning?.message || t('engine.overlap_warning_message')}
          confirmText={t('engine.proceed_anyway')}
          cancelText={t('engine.abort_upper')}
          onConfirm={() => {
            sendResume({ approved: true, proceed: true });
            clearOverlapWarning();
          }}
          onCancel={() => {
            sendResume({ approved: false, abort: true });
            clearOverlapWarning();
            setIsSubmitting(false);
          }}
        >
          {overlapWarning?.overlapping_trip && (
            <div style={{
              background: 'var(--color-accent-gold-soft)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
                {t('engine.conflicting_trip_details')}
              </div>
              <div>{t('engine.conflict_destination', { destination: overlapWarning.overlapping_trip.destination ?? '' })}</div>
              <div>{t('engine.conflict_dates', { start: overlapWarning.overlapping_trip.start_date ?? '', end: overlapWarning.overlapping_trip.end_date ?? '' })}</div>
            </div>
          )}
        </Modal>

        <Modal 
          isOpen={Boolean(verificationPayload)}
          variant="warning"
          title={t('engine.verification_title')}
          message={verificationPayload?.message || t('engine.verification_default_message')}
          confirmText={t('engine.confirm_and_optimize')}
          cancelText={t('engine.cancel_upper')}
          onConfirm={() => {
            sendResume({
              approved: true,
              proceed: true,
              ...(verificationPayload?.constraints || {}),
            });
            clearVerification();
          }}
          onCancel={() => {
            setIsSubmitting(false);
            clearVerification();
          }}
        >
          {verificationPayload?.fields && verificationPayload.fields.length > 0 && (
            <div style={{
              background: 'var(--color-accent-gold-soft)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
                {t('engine.flagged_fields')}
              </div>
              <div>{verificationPayload.fields.join(', ')}</div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <h2 className="font-display" style={{ margin: 0, fontSize: '2.25rem', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          {t('engine.new_trip_heading')}
        </h2>
      </div>

      <TripCreationBoxes
        key={queryPrefillKey || 'default'}
        onPersonalizedSubmit={handlePrepSubmit}
        onBlankSubmitStart={(msg) => {
          savedTripIdRef.current = null;
          isSavingRef.current = false;
          setIsSaving(false);
          setBlankCreationError(null);
          clearItinerary();
          useLogStore.getState().clearLogs();
          setBlankCreationStatus(msg || t('engine.creating_blank_workspace'));
        }}
        onBlankSubmitError={(err) => {
          setBlankCreationStatus(null);
          setBlankCreationError(err);
        }}
        externalError={blankCreationError}
        onClearExternalError={() => setBlankCreationError(null)}
        disabled={false}
        initialDestination={queryDest || 'Paris'}
        initialOrigin={queryOrigin || 'Madrid'}
        initialOriginIata={queryOriginIata}
        initialDestIata={queryDestIata}
        initialStartDate={queryStart}
        initialEndDate={queryEnd}
        initialBudget={queryBudget !== undefined ? Number(queryBudget) : 1500}
        initialCurrency={queryCurrency}
        initialDepartureHour={queryDepartureHour}
        initialArrivalHour={queryArrivalHour}
        initialHotelArea={queryHotelName}
        initialHotelAddress={queryHotelAddress}
        initialTravelers={queryTravelers}
        hasQueryPrefill={hasQueryPrefill}
        querySource={querySource}
        queryPrefillKey={queryPrefillKey}
        status={status}
        onReconnect={connect}
      />

      <Modal 
        isOpen={Boolean(verificationPayload)}
        variant="warning"
        title={t('engine.verification_title')}
        message={verificationPayload?.message || t('engine.verification_default_message')}
        confirmText={t('engine.confirm_and_optimize')}
        cancelText={t('engine.cancel_upper')}
        onConfirm={() => {
          sendResume({
            approved: true,
            proceed: true,
            ...(verificationPayload?.constraints || {}),
          });
          clearVerification();
        }}
        onCancel={() => {
          clearVerification();
        }}
      >
        {verificationPayload?.fields && verificationPayload.fields.length > 0 && (
          <div style={{
            background: 'var(--color-accent-gold-soft)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
              {t('engine.flagged_fields')}
            </div>
            <div>{verificationPayload.fields.join(', ')}</div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={Boolean(overlapWarning)}
        variant="warning"
        title={overlapWarning?.warning_title || t('engine.overlap_warning_title')}
        message={overlapWarning?.message || t('engine.overlap_warning_message')}
        confirmText={t('engine.proceed_anyway')}
        cancelText={t('engine.abort_upper')}
        onConfirm={() => {
          sendResume({ approved: true, proceed: true });
          clearOverlapWarning();
        }}
        onCancel={() => {
          sendResume({ approved: false, abort: true });
          clearOverlapWarning();
        }}
      >
        {overlapWarning?.overlapping_trip && (
          <div style={{
            background: 'var(--color-accent-gold-soft)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
              {t('engine.conflicting_trip_details')}
            </div>
            <div>{t('engine.conflict_destination', { destination: overlapWarning.overlapping_trip.destination ?? '' })}</div>
            <div>{t('engine.conflict_dates', { start: overlapWarning.overlapping_trip.start_date ?? '', end: overlapWarning.overlapping_trip.end_date ?? '' })}</div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={Boolean(guardrailAbort)}
        variant="danger"
        title={guardrailAbort?.title || t('engine.guardrails_abort_title')}
        message={t('engine.guardrails_abort_message')}
        confirmText={t('engine.dismiss_and_edit')}
        cancelText=""
        onConfirm={() => {
          clearGuardrailAbort();
        }}
        onCancel={() => {
          clearGuardrailAbort();
        }}
      >
        {guardrailAbort?.errors && guardrailAbort.errors.length > 0 && (
          <div style={{
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
              {t('engine.critical_violations')}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-primary)' }}>
              {guardrailAbort.errors.map((err, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
