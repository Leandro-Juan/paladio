"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { TripCreationBoxes } from '@/components/trip-creation/TripCreationBoxes';
import { useTripDraftStore } from '@/stores/tripDraftStore';
import { ThinkingScreen } from '@/components/trip-creation/ThinkingScreen';
import {
  getTripGenerationStageMessage,
  useTripGenerationStore,
} from '@/stores/tripGenerationStore';

export default function EnginePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, connect } = usePaladioSocket();
  const searchParams = useSearchParams();
  const queryJobId = searchParams.get('job') || undefined;
  const queryDest = searchParams.get('destination') || undefined;
  const queryOrigin = searchParams.get('origin') || undefined;
  const queryOriginIata = searchParams.get('origin_iata') || undefined;
  const queryDestIata = searchParams.get('dest_iata') || undefined;
  const queryStart = searchParams.get('start_date') || undefined;
  const queryEnd = searchParams.get('end_date') || undefined;
  const rawBudgetParam = searchParams.get('budget');
  const parsedQueryBudget =
    rawBudgetParam !== null && rawBudgetParam !== '' ? Number(rawBudgetParam) : NaN;
  const queryBudget =
    Number.isFinite(parsedQueryBudget) && parsedQueryBudget >= 0
      ? Math.round(parsedQueryBudget)
      : undefined;
  const queryCurrency = searchParams.get('currency') || undefined;
  const queryDepartureHour = searchParams.get('departure_hour') || undefined;
  const queryArrivalHour = searchParams.get('arrival_hour') || undefined;
  const queryHotelName = searchParams.get('hotel_name') || undefined;
  const queryHotelAddress = searchParams.get('hotel_address') || undefined;
  const rawTravelersParam = searchParams.get('travelers');
  const parsedQueryTravelers =
    rawTravelersParam !== null && rawTravelersParam !== ''
      ? Number(rawTravelersParam)
      : NaN;
  const queryTravelers = Number.isFinite(parsedQueryTravelers)
    ? Math.max(1, Math.round(parsedQueryTravelers))
    : undefined;
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

  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const draft = useTripDraftStore();

  const jobs = useTripGenerationStore((s) => s.jobs);
  const watchingJobId = useTripGenerationStore((s) => s.watchingJobId);
  const setWatchingJobId = useTripGenerationStore((s) => s.setWatchingJobId);
  const startPersonalizedJob = useTripGenerationStore((s) => s.startPersonalizedJob);
  const cancelJob = useTripGenerationStore((s) => s.cancelJob);
  const dismissJob = useTripGenerationStore((s) => s.dismissJob);

  const watchedIdRef = useRef<string | null>(null);
  const redirectedJobRef = useRef<string | null>(null);

  useEffect(() => {
    watchedIdRef.current = watchingJobId;
  }, [watchingJobId]);

  // Ensure WebSocket uplink is connected when entering Engine cockpit
  useEffect(() => {
    if (status === 'disconnected') {
      connect();
    }
  }, [status, connect]);

  // Attach to ?job=<id> if navigated back from floating background indicator
  useEffect(() => {
    if (queryJobId) {
      setWatchingJobId(queryJobId);
    }
  }, [queryJobId, setWatchingJobId]);

  // Clear watching state on unmount ONLY (never cancels background jobs)
  useEffect(() => {
    return () => {
      const currentWatched = useTripGenerationStore.getState().watchingJobId;
      if (currentWatched && currentWatched === watchedIdRef.current) {
        useTripGenerationStore.getState().setWatchingJobId(null);
      }
    };
  }, []);

  const watchingJob = watchingJobId ? jobs[watchingJobId] || null : null;

  // Auto-redirect only if the user stayed on /engine watching this specific job
  useEffect(() => {
    if (
      watchingJob &&
      watchingJob.status === 'completed' &&
      watchingJob.trip_id &&
      redirectedJobRef.current !== watchingJob.id
    ) {
      redirectedJobRef.current = watchingJob.id;
      const targetTripId = watchingJob.trip_id;
      void dismissJob(watchingJob.id);
      setWatchingJobId(null);
      router.push(`/trips/${targetTripId}`);
    }
  }, [watchingJob, dismissJob, setWatchingJobId, router]);

  const handlePrepSubmit = async (prompt: string, extras: Record<string, unknown>) => {
    setSubmissionError(null);
    setIsSubmittingRequest(true);
    try {
      await startPersonalizedJob(prompt, extras);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t('engine.unexpected_error');
      setSubmissionError(msg);
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const isWatchingActiveJob = Boolean(
    isSubmittingRequest ||
      (watchingJob &&
        (watchingJob.status === 'running' ||
          watchingJob.status === 'awaiting_input' ||
          watchingJob.status === 'completed' ||
          watchingJob.status === 'failed'))
  );

  if (isWatchingActiveJob) {
    const thinkingMessage = watchingJob
      ? watchingJob.status === 'completed'
        ? t('engine.thinking_saving_trip')
        : getTripGenerationStageMessage(
            watchingJob.stage,
            watchingJob.stage_message,
            t
          )
      : t('engine.thinking_initializing');

    const destName =
      watchingJob?.destination ||
      draft.destination ||
      queryDest ||
      t('engine.trip_fallback');
    const subMessage = t('engine.thinking_submessage', {
      destination: destName.toUpperCase(),
    });

    const errorMessage =
      watchingJob?.status === 'failed'
        ? watchingJob.error_message || t('engine.unexpected_error')
        : null;

    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '1.5rem 1rem' }}>
        <ThinkingScreen
          message={thinkingMessage}
          subMessage={subMessage}
          helperText={!errorMessage ? t('engine.thinking_background_hint') : undefined}
          onContinueInBackground={
            !errorMessage
              ? () => {
                  setWatchingJobId(null);
                  router.push('/dashboard');
                }
              : undefined
          }
          continueInBackgroundLabel={t('engine.continue_in_background')}
          onCancel={
            !errorMessage && watchingJob
              ? () => {
                  void cancelJob(watchingJob.id);
                }
              : undefined
          }
          cancelLabel={t('engine.cancel_generation')}
          error={errorMessage}
          onDismissError={() => {
            if (watchingJob) {
              void dismissJob(watchingJob.id);
            }
            setWatchingJobId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <h2
          className="font-display"
          style={{
            margin: 0,
            fontSize: '2.25rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          {t('engine.new_trip_heading')}
        </h2>
      </div>

      <TripCreationBoxes
        key={queryPrefillKey || 'default'}
        onPersonalizedSubmit={handlePrepSubmit}
        onBlankSubmitStart={() => {
          setSubmissionError(null);
        }}
        onBlankSubmitError={(err) => {
          setSubmissionError(err);
        }}
        externalError={submissionError}
        onClearExternalError={() => setSubmissionError(null)}
        disabled={false}
        demoLockedSubmit={true}
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
    </div>
  );
}
