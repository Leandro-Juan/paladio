"use client";
import React, { useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { useTrips } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { extractDestination } from '@/utils/tripParser';
import { TripCreationBoxes } from '@/components/trip-creation/TripCreationBoxes';
import { useTripDraftStore } from '@/stores/tripDraftStore';


export default function EnginePage() {
  const router = useRouter();
  const {
    status,
    itinerary,
    overlapWarning,
    clearOverlapWarning,
    guardrailAbort,
    clearGuardrailAbort,
    sendMessage,
    sendResume,
  } = usePaladioSocket();
  const { saveTrip } = useTrips();
  const searchParams = useSearchParams();
  const queryDest = searchParams.get('destination') || undefined;
  const queryOrigin = searchParams.get('origin') || undefined;
  const queryStart = searchParams.get('start_date') || undefined;
  const queryEnd = searchParams.get('end_date') || undefined;
  const queryBudget = searchParams.get('budget') ? Math.round(Number(searchParams.get('budget'))) : undefined;

  const isSavingRef = useRef(false);
  const savedTripIdRef = useRef<string | null>(null);
  const lastExtrasRef = useRef<Record<string, unknown>>({});

  const handlePrepSubmit = (prompt: string, extras: Record<string, unknown>) => {
    lastExtrasRef.current = extras;
    const newThreadId = 'paladio_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    sendMessage(prompt, { ...extras, thread_id: newThreadId });
  };

  const handleSaveTrip = useCallback(async () => {
    if (!itinerary || isSavingRef.current || savedTripIdRef.current) return;
    isSavingRef.current = true;
    
    const destination = extractDestination(itinerary);
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
    
    const itineraryPayload = {
      ...itinerary,
      ...(lastExtrasRef.current.scanned_documents ? { scanned_documents: lastExtrasRef.current.scanned_documents } : {}),
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
      router.push(`/trips/${saved.id}`);
    }
    
    isSavingRef.current = false;
  }, [itinerary, saveTrip, router]);

  // When personalized optimization finishes, auto-save and redirect to trip workspace
  useEffect(() => {
    if (itinerary && !isSavingRef.current && !savedTripIdRef.current) {
      void handleSaveTrip();
    }
  }, [itinerary, handleSaveTrip]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <h2 className="font-display" style={{ margin: 0, fontSize: '2.25rem', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          NEW TRIP
        </h2>
        <span className="font-mono text-xs text-muted" style={{ display: 'block', marginTop: '6px', letterSpacing: '0.04em' }}>
          {'// SOVEREIGN ITINERARY GENERATION & BLANK CANVAS'}
        </span>
        {status === 'inferencing' && (
          <div style={{ marginTop: '0.75rem' }}>
            <span className="font-mono text-xs text-accent" style={{ fontWeight: 600 }}>
              ● SWARM INFERENCING
            </span>
          </div>
        )}
      </div>

      <TripCreationBoxes
        key={`${queryDest}-${queryOrigin}-${queryStart}-${queryEnd}-${queryBudget}`}
        onPersonalizedSubmit={handlePrepSubmit}
        disabled={status === 'disconnected' || status === 'inferencing'}
        initialDestination={queryDest || 'Paris'}
        initialOrigin={queryOrigin || 'Madrid'}
        initialStartDate={queryStart}
        initialEndDate={queryEnd}
        initialBudget={queryBudget ? Number(queryBudget) : 1500}
        status={status}
      />

      <Modal 
        isOpen={Boolean(overlapWarning)}
        variant="warning"
        title={overlapWarning?.warning_title || "[WARNING] TRIP SCHEDULE OVERLAP"}
        message={overlapWarning?.message || "A scheduling overlap was detected with an existing trip in your database."}
        confirmText="PROCEED ANYWAY"
        cancelText="ABORT"
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
              CONFLICTING TRIP DETAILS:
            </div>
            <div>Destination: {overlapWarning.overlapping_trip.destination}</div>
            <div>Dates: {overlapWarning.overlapping_trip.start_date} to {overlapWarning.overlapping_trip.end_date}</div>
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={Boolean(guardrailAbort)}
        variant="danger"
        title={guardrailAbort?.title || "[GUARDRAILS ABORTED] TRIP REJECTED"}
        message="The optimization swarm rejected the mission constraints based on deterministic guardrails:"
        confirmText="DISMISS & EDIT"
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
              CRITICAL VIOLATIONS:
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
