"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { updatePreferencesApi } from '@/utils/api';
import {
  CALIBRATION_QUESTIONS,
  computeCalibratedPreferences,
  isTasteVectorNeutral,
} from '@/utils/tasteCalibration';
import styles from './taste-calibration.module.css';

type AnswerChoice = 'A' | 'B' | 'C' | 'D';

export default function TasteCalibrationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const { t } = useTranslation();

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, AnswerChoice>>({});
  const [skippedIds, setSkippedIds] = useState<Record<string, boolean>>({});
  const [selectedChoice, setSelectedChoice] = useState<AnswerChoice | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className={styles.loadingWrap}>
        <PaladioLoader />
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  // Strictly enforce: ONLY available when user's taste vector values are all around 0.5
  if (!isTasteVectorNeutral(user)) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.guardCard}>
          <span className={styles.dimensionTag}>{t('taste_calibration.calibrated_badge')}</span>
          <h1 className={styles.guardTitle}>{t('taste_calibration.already_active_title')}</h1>
          <p className={styles.guardText}>
            {t('taste_calibration.already_active_desc')}
          </p>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => router.push('/dashboard')}
          >
            {t('taste_calibration.back_to_dashboard')}
          </button>
        </div>
      </div>
    );
  }

  const totalQuestions = CALIBRATION_QUESTIONS.length;
  const currentQuestion = CALIBRATION_QUESTIONS[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const resolvedCount = Object.keys(answers).length + Object.keys(skippedIds).length;
  const completionPct = Math.round((resolvedCount / totalQuestions) * 100);
  const activeChoice = selectedChoice ?? answers[currentQuestion.id] ?? null;

  const finalizeCalibration = async (finalAnswers: Record<string, AnswerChoice>) => {
    if (Object.keys(finalAnswers).length === 0) {
      router.push('/dashboard');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const merged = computeCalibratedPreferences(
        finalAnswers,
        user.preferences as Record<string, unknown> | undefined
      );
      await updatePreferencesApi(merged);
      await refreshUser();
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'taste_calibration.save_error'
      );
      setSaving(false);
    }
  };

  const advanceOrFinish = async (
    nextAnswers: Record<string, AnswerChoice>,
    nextSkipped: Record<string, boolean>
  ) => {
    if (currentIndex + 1 < totalQuestions) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedChoice(nextAnswers[CALIBRATION_QUESTIONS[nextIndex].id] ?? null);
      return;
    }
    void nextSkipped;
    await finalizeCalibration(nextAnswers);
  };

  const handleSubmitStep = async () => {
    if (!activeChoice || saving) return;
    const nextAnswers = { ...answers, [currentQuestion.id]: activeChoice };
    const nextSkipped = { ...skippedIds };
    delete nextSkipped[currentQuestion.id];
    setAnswers(nextAnswers);
    setSkippedIds(nextSkipped);
    await advanceOrFinish(nextAnswers, nextSkipped);
  };

  const handleSkipStep = async () => {
    if (saving) return;
    const nextAnswers = { ...answers };
    delete nextAnswers[currentQuestion.id];
    const nextSkipped = { ...skippedIds, [currentQuestion.id]: true };
    setAnswers(nextAnswers);
    setSkippedIds(nextSkipped);
    await advanceOrFinish(nextAnswers, nextSkipped);
  };

  const handleJumpTo = (idx: number) => {
    if (saving) return;
    setCurrentIndex(idx);
    setSelectedChoice(answers[CALIBRATION_QUESTIONS[idx].id] ?? null);
  };

  return (
    <div className={styles.pageShell}>
      {/* Top Header */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.push('/dashboard')}
            aria-label={t('taste_calibration.back_to_dashboard_aria')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className={styles.headerTitleGroup}>
            <h1 className={styles.headerTitle}>{t('taste_calibration.page_title')}</h1>
            <span className={styles.headerSubtitle}>
              {t('taste_calibration.completion_subtitle', { pct: completionPct })}
            </span>
          </div>
        </div>

        <span className={styles.headerProgressPill}>
          {t('taste_calibration.answered_pill', { answered: answeredCount, total: totalQuestions })}
        </span>
      </header>

      {/* Main Split Layout */}
      <main className={styles.workspace}>
        {/* Left Calibration Track Sidebar */}
        <aside className={styles.trackPanel} aria-label={t('taste_calibration.track_heading')}>
          <div className={styles.trackHeader}>
            <div>
              <h2 className={styles.trackHeading}>{t('taste_calibration.track_heading')}</h2>
              <div className={styles.trackSub}>
                {t('taste_calibration.track_completed_pct', { pct: completionPct })}
              </div>
            </div>
          </div>

          <div className={styles.infoCallout}>
            {t('taste_calibration.info_callout')}
          </div>

          <div className={styles.trackList}>
            {CALIBRATION_QUESTIONS.map((q, idx) => {
              const isActive = idx === currentIndex;
              const isAnswered = Boolean(answers[q.id]);
              const isSkipped = Boolean(skippedIds[q.id]);

              let statusLabel = t('taste_calibration.status_not_attempted');
              if (isActive) statusLabel = t('taste_calibration.status_in_progress');
              else if (isAnswered) statusLabel = t('taste_calibration.status_completed_choice', { choice: answers[q.id] });
              else if (isSkipped) statusLabel = t('taste_calibration.status_skipped');

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleJumpTo(idx)}
                  className={[
                    styles.trackItem,
                    isActive ? styles.trackItemActive : '',
                    !isActive && isAnswered ? styles.trackItemDone : '',
                    !isActive && isSkipped ? styles.trackItemSkipped : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={styles.trackItemTitle}>
                    {idx + 1}. {t(q.trackTitle)}
                  </span>
                  <span className={styles.trackItemStatus}>{statusLabel}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Question Card */}
        <section className={styles.questionCard} aria-live="polite">
          <div key={currentQuestion.id} className={`${styles.questionBody} animate-tab-pane`}>
            <div className={styles.questionMetaRow}>
              <span className={styles.stepCounter}>
                {t('taste_calibration.step_counter', {
                  current: String(currentIndex + 1).padStart(2, '0'),
                  total: String(totalQuestions).padStart(2, '0'),
                })}
              </span>
              <span className={styles.dimensionTag}>
                {t(currentQuestion.dimensionLabel)}
              </span>
            </div>

            <h2 className={styles.questionPrompt}>{t(currentQuestion.prompt)}</h2>

            <div className={styles.optionsGrid} role="radiogroup" aria-label={t(currentQuestion.prompt)}>
              {currentQuestion.options.map((option) => {
                const isSelected = activeChoice === option.id;
                return (
                  <label
                    key={option.id}
                    className={[
                      styles.optionCard,
                      isSelected ? styles.optionCardSelected : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option.id}
                      checked={isSelected}
                      onChange={() => setSelectedChoice(option.id)}
                      className={styles.hiddenRadio}
                    />
                    <span className={styles.radioCircle} aria-hidden="true">
                      {isSelected && <span className={styles.radioDot} />}
                    </span>
                    <span className={styles.optionTextWrap}>
                      <span className={styles.optionTitle}>
                        {option.id}. {t(option.label)}
                      </span>
                      <span className={styles.optionSub}>{t(option.sublabel)}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {error && (
              <div className={styles.errorBanner} role="alert">
                {t(error)}
              </div>
            )}

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.submitBtn}
                disabled={!activeChoice || saving}
                onClick={handleSubmitStep}
              >
                {saving
                  ? t('taste_calibration.calibrating')
                  : currentIndex + 1 === totalQuestions
                  ? t('taste_calibration.finish_and_save')
                  : t('taste_calibration.submit')}
              </button>

              <button
                type="button"
                className={styles.skipBtn}
                disabled={saving}
                onClick={handleSkipStep}
              >
                {currentIndex + 1 === totalQuestions && answeredCount === 0
                  ? t('taste_calibration.skip_all')
                  : t('taste_calibration.skip')}
              </button>
            </div>
          </div>

          <div className={styles.progressTrack} aria-hidden="true">
            <div
              className={styles.progressFill}
              style={{
                transform: `scaleX(${
                  Math.max(
                    Math.round(((currentIndex + 1) / totalQuestions) * 100),
                    completionPct
                  ) / 100
                })`,
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
