"use client";

import React, { useEffect, useRef } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { useTranslation } from '@/hooks/useTranslation';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTripGenerationStore } from '@/stores/tripGenerationStore';
import { Modal } from '@/components/Modal';

export function TripGenerationOverlay() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const { status: socketStatus } = usePaladioSocket();

  const jobs = useTripGenerationStore((s) => s.jobs);
  const hydrateJobs = useTripGenerationStore((s) => s.hydrateJobs);
  const resumeJob = useTripGenerationStore((s) => s.resumeJob);
  const dismissJob = useTripGenerationStore((s) => s.dismissJob);
  const resetForUser = useTripGenerationStore((s) => s.resetForUser);

  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const prevSocketStatusRef = useRef(socketStatus);

  const authUserId = auth?.user?.id ?? null;
  const isAuthLoading = auth?.isLoading ?? false;

  // Hydrate background jobs when authenticated user loads or changes
  useEffect(() => {
    if (isAuthLoading) return;

    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== authUserId) {
      resetForUser();
    }
    prevUserIdRef.current = authUserId;

    if (!authUserId) return;

    const notifStore = useNotificationStore.getState();
    if (notifStore.currentUserId !== authUserId) {
      notifStore.initUser(authUserId);
    }

    void hydrateJobs();
  }, [authUserId, isAuthLoading, hydrateJobs, resetForUser]);

  // Re-sync with backend whenever WebSocket reconnects
  useEffect(() => {
    const prev = prevSocketStatusRef.current;
    prevSocketStatusRef.current = socketStatus;
    if (socketStatus === 'connected' && prev !== 'connected' && authUserId) {
      void hydrateJobs();
    }
  }, [socketStatus, authUserId, hydrateJobs]);

  const hasActiveServerJob = Object.values(jobs).some(
    (j) => j.kind !== 'blank' && j.status === 'running'
  );

  // Fallback polling only while a server job is running AND WebSocket is not connected
  useEffect(() => {
    if (!authUserId || !hasActiveServerJob || socketStatus === 'connected') {
      return;
    }
    const timer = window.setInterval(() => {
      void hydrateJobs();
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [authUserId, hasActiveServerJob, socketStatus, hydrateJobs]);

  const jobList = Object.values(jobs);
  const awaitingJob = jobList.find((j) => j.status === 'awaiting_input') || null;
  const abortedJob = !awaitingJob ? jobList.find((j) => j.status === 'aborted') || null : null;

  if (awaitingJob) {
    const interruptType = awaitingJob.interrupt_type || awaitingJob.stage;
    const payload = awaitingJob.interrupt_payload;

    if (interruptType === 'TRIP_OVERLAP_WARNING') {
      return (
        <Modal
          isOpen={true}
          variant="warning"
          title={payload?.warning_title || t('engine.overlap_warning_title')}
          message={payload?.message || t('engine.overlap_warning_message')}
          confirmText={t('engine.proceed_anyway')}
          cancelText={t('engine.abort_upper')}
          onConfirm={() => {
            void resumeJob(awaitingJob.id, { approved: true, proceed: true });
          }}
          onCancel={() => {
            void resumeJob(awaitingJob.id, { approved: false, abort: true });
          }}
        >
          {payload?.overlapping_trip && (
            <div
              style={{
                background: 'var(--color-accent-gold-soft)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                padding: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
                {t('engine.conflicting_trip_details')}
              </div>
              <div>
                {t('engine.conflict_destination', {
                  destination: payload.overlapping_trip.destination ?? '',
                })}
              </div>
              <div>
                {t('engine.conflict_dates', {
                  start: payload.overlapping_trip.start_date ?? '',
                  end: payload.overlapping_trip.end_date ?? '',
                })}
              </div>
            </div>
          )}
        </Modal>
      );
    }

    return (
      <Modal
        isOpen={true}
        variant="warning"
        title={t('engine.verification_title')}
        message={payload?.message || t('engine.verification_default_message')}
        confirmText={t('engine.confirm_and_optimize')}
        cancelText={t('engine.cancel_upper')}
        onConfirm={() => {
          void resumeJob(awaitingJob.id, {
            approved: true,
            proceed: true,
            ...(payload?.constraints || {}),
          });
        }}
        onCancel={() => {
          void resumeJob(awaitingJob.id, { approved: false, abort: true });
        }}
      >
        {payload?.fields && payload.fields.length > 0 && (
          <div
            style={{
              background: 'var(--color-accent-gold-soft)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--color-accent-gold)', marginBottom: '0.25rem' }}>
              {t('engine.flagged_fields')}
            </div>
            <div>{payload.fields.join(', ')}</div>
          </div>
        )}
      </Modal>
    );
  }

  if (abortedJob) {
    const errors = abortedJob.guardrail_errors || [];
    return (
      <Modal
        isOpen={true}
        variant="danger"
        title={t('engine.guardrails_abort_title')}
        message={t('engine.guardrails_abort_message')}
        confirmText={t('engine.dismiss_and_edit')}
        cancelText=""
        onConfirm={() => {
          void dismissJob(abortedJob.id);
        }}
        onCancel={() => {
          void dismissJob(abortedJob.id);
        }}
      >
        {errors.length > 0 && (
          <div
            style={{
              background: 'var(--color-danger-soft)',
              border: '1px solid var(--color-danger)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
              {t('engine.critical_violations')}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-primary)' }}>
              {errors.map((err, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    );
  }

  return null;
}
