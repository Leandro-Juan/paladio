"use client";
import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { useTrips } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { extractDestination } from '@/utils/tripParser';
import { TripCreationBoxes } from '@/components/trip-creation/TripCreationBoxes';
import { useTripDraftStore } from '@/stores/tripDraftStore';
import { useLogStore } from '@/contexts/SocketContext';
import { ThinkingScreen } from '@/components/trip-creation/ThinkingScreen';

function getThinkingMessage(lastLog: string | undefined, defaultMsg = 'Creating your continuous itinerary...'): string {
  if (!lastLog) return defaultMsg;
  const upper = lastLog.toUpperCase();
  if (upper.includes('SAVING') || upper.includes('REDIRECTING')) return 'Saving trip to your workspace...';
  if (upper.includes('ITINERARY GENERATED')) return 'Finalizing continuous itinerary...';
  if (upper.includes('OPTIMIZING ROUTES') || upper.includes('C++ SOLVER')) return 'Optimizing daily routes and transit with C++ solver...';
  if (upper.includes('EXTRACTING_CONSTRAINTS') || upper.includes('CONSTRAINTS EXTRACTED')) return 'Preparing optimization constraints...';
  if (upper.includes('SCRAPING_DYNAMIC_DATA') || upper.includes('FETCHING POIS')) return 'Discovering attractions, local dining & transit routes...';
  if (upper.includes('ANALYZING_PROMPT') || upper.includes('ANALYZING USER')) return 'Analyzing your travel preferences & pacing...';
  if (upper.includes('ROUTING_INTENT')) return 'Routing trip intent through agent swarm...';
  if (upper.includes('VALIDATING TRIP')) return 'Validating schedule constraints...';
  if (upper.includes('GUARDRAILS_PASSED')) return 'Schedule verified. Preparing route solver...';
  if (upper.includes('GUARDRAILS')) return 'Evaluating schedule guardrails & feasibility...';
  if (upper.includes('REVIEWING TRIP') || upper.includes('VERIFYING_CONSTRAINTS')) return 'Synthesizing travel anchors & dates...';
  if (upper.includes('BOOKING ANCHORS') || upper.includes('PARSING_TICKETS')) return 'Processing booking anchors...';
  if (upper.includes('INITIALIZING LANGGRAPH') || upper.includes('INITIALIZING')) return 'Initializing AI solver swarm...';
  if (upper.includes('UPLINK') || upper.includes('NETWORK') || upper.includes('TELEMETRY') || upper.includes('HEARTBEAT')) {
    return defaultMsg;
  }
  
  const cleaned = lastLog.replace(/^>\s*/, '').replace(/^\[.*?\]\s*/, '').trim();
  return cleaned.length > 3 ? cleaned : defaultMsg;
}

export default function EnginePage() {
  const router = useRouter();
  const {
    status,
    itinerary,
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
  const queryStart = searchParams.get('start_date') || undefined;
  const queryEnd = searchParams.get('end_date') || undefined;
  const queryBudget = searchParams.get('budget') ? Math.round(Number(searchParams.get('budget'))) : undefined;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blankCreationStatus, setBlankCreationStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const logs = useLogStore((state) => state.logs);
  const draft = useTripDraftStore();

  const isSavingRef = useRef(false);
  const savedTripIdRef = useRef<string | null>(null);
  const lastExtrasRef = useRef<Record<string, unknown>>({});

  const handlePrepSubmit = (prompt: string, extras: Record<string, unknown>) => {
    setIsSubmitting(true);
    lastExtrasRef.current = extras;
    const newThreadId = 'paladio_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    sendMessage(prompt, { ...extras, auto_verify: true, thread_id: newThreadId });
  };


  const handleSaveTrip = useCallback(async () => {
    if (!itinerary || isSavingRef.current || savedTripIdRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    
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
    } else {
      isSavingRef.current = false;
      setIsSaving(false);
      setIsSubmitting(false);
    }
  }, [itinerary, saveTrip, router]);

  // Ensure WebSocket uplink is connected when entering Engine cockpit
  useEffect(() => {
    if (status === 'disconnected') {
      connect();
    }
  }, [status, connect]);

  // When personalized optimization finishes, auto-save and redirect to trip workspace
  useEffect(() => {
    if (itinerary && !isSavingRef.current && !savedTripIdRef.current) {
      void handleSaveTrip();
    }
  }, [itinerary, handleSaveTrip]);

  const isCreatingTrip = isSubmitting || status === 'inferencing' || isSaving || Boolean(blankCreationStatus);

  if (isCreatingTrip) {
    const lastLog = logs[logs.length - 1];
    let thinkingMessage = 'Creating your continuous itinerary...';
    if (blankCreationStatus) {
      thinkingMessage = blankCreationStatus;
    } else if (isSaving) {
      thinkingMessage = 'Saving trip to your workspace...';
    } else {
      thinkingMessage = getThinkingMessage(lastLog);
    }

    const destName = draft.destination || queryDest || 'Trip';
    const subMessage = `${destName.toUpperCase()} • CONTINUOUS SOVEREIGN OPTIMIZER`;

    const errorMessage = (status === 'error' && !guardrailAbort)
      ? (lastLog?.replace(/^>\s*/, '') || 'The optimizer encountered an unexpected error.')
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
          }}
        />

        <Modal 
          isOpen={Boolean(guardrailAbort)}
          variant="danger"
          title={guardrailAbort?.title || "[GUARDRAILS ABORTED] TRIP REJECTED"}
          message="The optimization swarm rejected the mission constraints based on deterministic guardrails:"
          confirmText="DISMISS & EDIT"
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
                CONFLICTING TRIP DETAILS:
              </div>
              <div>Destination: {overlapWarning.overlapping_trip.destination}</div>
              <div>Dates: {overlapWarning.overlapping_trip.start_date} to {overlapWarning.overlapping_trip.end_date}</div>
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
          NEW TRIP
        </h2>
      </div>

      <TripCreationBoxes
        key={`${queryDest}-${queryOrigin}-${queryStart}-${queryEnd}-${queryBudget}`}
        onPersonalizedSubmit={handlePrepSubmit}
        onBlankSubmitStart={(msg) => setBlankCreationStatus(msg || 'Creating blank trip workspace...')}
        disabled={false}
        initialDestination={queryDest || 'Paris'}
        initialOrigin={queryOrigin || 'Madrid'}
        initialStartDate={queryStart}
        initialEndDate={queryEnd}
        initialBudget={queryBudget ? Number(queryBudget) : 1500}
        status={status}
        onReconnect={connect}
      />

      <Modal 
        isOpen={Boolean(verificationPayload)}
        variant="warning"
        title="[CONSTRAINTS VERIFICATION] REVIEW TRIP PARAMETERS"
        message={verificationPayload?.message || "Review extracted parameters before generating itinerary."}
        confirmText="CONFIRM & OPTIMIZE"
        cancelText="CANCEL"
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
              FLAGGED FIELDS:
            </div>
            <div>{verificationPayload.fields.join(', ')}</div>
          </div>
        )}
      </Modal>

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
