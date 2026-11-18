"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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
          <span className={styles.dimensionTag}>TASTE VECTOR // CALIBRATED</span>
          <h1 className={styles.guardTitle}>Your taste profile is already active</h1>
          <p className={styles.guardText}>
            Initial taste calibration is only available when your 8-point Harmonic Radar is at its 0.50 neutral baseline. You can fine-tune preferences anytime in Settings.
          </p>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => router.push('/dashboard')}
          >
            Back to Dashboard
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
        err instanceof Error ? err.message : 'Failed to save your calibrated taste profile.'
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
            aria-label="Back to dashboard"
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
            <h1 className={styles.headerTitle}>Harmonic Taste Calibration</h1>
            <span className={styles.headerSubtitle}>
              {completionPct}% of Taste Seeding Completed
            </span>
          </div>
        </div>

        <span className={styles.headerProgressPill}>
          {answeredCount} / {totalQuestions} ANSWERED
        </span>
      </header>

      {/* Main Split Layout */}
      <main className={styles.workspace}>
        {/* Left Calibration Track Sidebar */}
        <aside className={styles.trackPanel} aria-label="Calibration Track">
          <div className={styles.trackHeader}>
            <div>
              <h2 className={styles.trackHeading}>Calibration Track</h2>
              <div className={styles.trackSub}>{completionPct}% completed</div>
            </div>
          </div>

          <div className={styles.infoCallout}>
            Answer as many prompts as you like to seed your 768D semantic taste vector and 8-point Harmonic Radar. Any step can be skipped.
          </div>

          <div className={styles.trackList}>
            {CALIBRATION_QUESTIONS.map((q, idx) => {
              const isActive = idx === currentIndex;
              const isAnswered = Boolean(answers[q.id]);
              const isSkipped = Boolean(skippedIds[q.id]);

              let statusLabel = 'Not Attempted';
              if (isActive) statusLabel = 'In progress';
              else if (isAnswered) statusLabel = `Completed (${answers[q.id]})`;
              else if (isSkipped) statusLabel = 'Skipped';

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
                    {idx + 1}. {q.trackTitle}
                  </span>
                  <span className={styles.trackItemStatus}>{statusLabel}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Question Card */}
        <section className={styles.questionCard} aria-live="polite">
          <div className={styles.questionBody}>
            <div className={styles.questionMetaRow}>
              <span className={styles.stepCounter}>
                STEP {String(currentIndex + 1).padStart(2, '0')} /{' '}
                {String(totalQuestions).padStart(2, '0')}
              </span>
              <span className={styles.dimensionTag}>
                {currentQuestion.dimensionLabel}
              </span>
            </div>

            <h2 className={styles.questionPrompt}>{currentQuestion.prompt}</h2>

            <div className={styles.optionsGrid} role="radiogroup" aria-label={currentQuestion.prompt}>
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
                        {option.id}. {option.label}
                      </span>
                      <span className={styles.optionSub}>{option.sublabel}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {error && (
              <div className={styles.errorBanner} role="alert">
                {error}
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
                  ? 'Calibrating...'
                  : currentIndex + 1 === totalQuestions
                  ? 'Finish & Save'
                  : 'Submit'}
              </button>

              <button
                type="button"
                className={styles.skipBtn}
                disabled={saving}
                onClick={handleSkipStep}
              >
                {currentIndex + 1 === totalQuestions && answeredCount === 0
                  ? 'Skip All'
                  : 'Skip'}
              </button>
            </div>
          </div>

          <div className={styles.progressTrack} aria-hidden="true">
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.max(
                  Math.round(((currentIndex + 1) / totalQuestions) * 100),
                  completionPct
                )}%`,
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
