"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { useAnimatedMount, useEscapeAndFocusReturn } from '@/hooks/useAnimatedMount';
import { CloseIcon, Spinner, SettingsIcon, CalendarIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { RouteIntakeBar } from '@/components/trip-creation/RouteIntakeBar';
import { ParticipantsManager, SelectedParticipant } from '@/components/trip-creation/ParticipantsManager';
import { PaladioSingleDatePicker } from '@/components/trip-creation/PaladioSingleDatePicker';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import styles from './NewRouteModal.module.css';

interface NewRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDefaultCurrency?: string;
  existingRoutes?: Array<{ origin_iata: string; destination_code: string }>;
  onSubmit: (data: {
    origin_iata: string;
    destination_code: string;
    earliest_date?: string | null;
    latest_date?: string | null;
    min_nights: number;
    max_nights: number;
    travelers: number;
    participants?: SelectedParticipant[];
    max_budget_eur: number;
    currency?: string;
  }) => Promise<unknown>;
}

const DURATION_PRESETS = [
  { labelKey: 'monitoring.preset_3_days', subKey: 'monitoring.preset_2_3_nights', range: [2, 3] as [number, number] },
  { labelKey: 'monitoring.preset_5_days', subKey: 'monitoring.preset_4_5_nights', range: [4, 5] as [number, number] },
  { labelKey: 'monitoring.preset_10_days', subKey: 'monitoring.preset_7_10_nights', range: [7, 10] as [number, number] },
  { labelKey: 'monitoring.preset_any_full', subKey: 'monitoring.preset_1_30_nights', range: [1, 30] as [number, number] },
];

function formatDisplayDate(dateStr: string, locale: string = 'en'): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const mIndex = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(mIndex) || isNaN(d) || mIndex < 0 || mIndex > 11) return dateStr;
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const monthStr = new Intl.DateTimeFormat(intlLocale, { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, mIndex, 1))
  );
  return `${monthStr} ${d}, ${parts[0]}`;
}

export function NewRouteModal({ isOpen, onClose, userDefaultCurrency, existingRoutes, onSubmit }: NewRouteModalProps) {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const initialCurrency = userDefaultCurrency || (user?.preferences?.default_currency as string) || 'EUR';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const defaultEarliest = tomorrow.toISOString().slice(0, 10);

  const plusSixty = new Date();
  plusSixty.setDate(plusSixty.getDate() + 60);
  const defaultLatest = plusSixty.toISOString().slice(0, 10);

  const [originCity, setOriginCity] = useState<string>('Madrid');
  const [destCity, setDestCity] = useState<string>('Rome');
  const [originIata, setOriginIata] = useState<string>('MAD');
  const [destIata, setDestIata] = useState<string>('FCO');

  const [earliestDate, setEarliestDate] = useState<string>(defaultEarliest);
  const [latestDate, setLatestDate] = useState<string>(defaultLatest);
  const [isEarliestPickerOpen, setIsEarliestPickerOpen] = useState<boolean>(false);
  const [isLatestPickerOpen, setIsLatestPickerOpen] = useState<boolean>(false);
  const [minNights, setMinNights] = useState<number>(2);
  const [maxNights, setMaxNights] = useState<number>(5);
  const [budget, setBudget] = useState<number>(150);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialCurrency);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showRateLimitWarning, setShowRateLimitWarning] = useState<boolean>(false);

  const handleClose = () => {
    setShowRateLimitWarning(false);
    setError(null);
    onClose();
  };

  // Close date pickers on outside click
  useEffect(() => {
    if (!isEarliestPickerOpen && !isLatestPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.datePickerAnchor}`)) {
        setIsEarliestPickerOpen(false);
        setIsLatestPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEarliestPickerOpen, isLatestPickerOpen]);

  // Initialize participants with current user as organizer
  const [participants, setParticipants] = useState<SelectedParticipant[]>(() => {
    if (!user) return [];
    return [
      {
        id: user.id || 'organizer',
        name: (user as { name?: string }).name || user.username || translate('vault.role_organizer'),
        email: user.email || '',
        user_id: user.id,
        is_guest: false,
        is_organizer: true,
      },
    ];
  });

  useEffect(() => {
    if (user && participants.length === 0) {
      const timer = setTimeout(() => {
        setParticipants([
          {
            id: user.id || 'organizer',
            name: (user as { name?: string }).name || user.username || translate('vault.role_organizer'),
            email: user.email || '',
            user_id: user.id,
            is_guest: false,
            is_organizer: true,
          },
        ]);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, participants.length]);

  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);
  useEscapeAndFocusReturn(isOpen, handleClose);

  if (!shouldRender) return null;

  const travelersCount = Math.max(1, participants.length);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const origCode = (originIata || originCity).trim().toUpperCase();
    const destCode = (destIata || destCity).trim().toUpperCase();

    if (!origCode || origCode.length !== 3) {
      setError(t('monitoring.err_origin_iata'));
      return;
    }
    if (!destCode || destCode.length < 3) {
      setError(t('monitoring.err_dest_code'));
      return;
    }
    if (origCode === destCode) {
      setError(t('monitoring.err_same_corridor'));
      return;
    }
    const isDuplicate = existingRoutes?.some(
      (r) =>
        r.origin_iata.trim().toUpperCase() === origCode &&
        r.destination_code.trim().toUpperCase() === destCode
    );
    if (isDuplicate) {
      setError(t('monitoring.err_duplicate_route', { origin: origCode, dest: destCode }));
      return;
    }
    if (earliestDate && latestDate && new Date(earliestDate) > new Date(latestDate)) {
      setError(t('monitoring.err_date_order'));
      return;
    }
    if (Number(minNights) < 1) {
      setError(t('monitoring.err_min_nights'));
      return;
    }
    if (Number(maxNights) < Number(minNights)) {
      setError(t('monitoring.err_max_nights'));
      return;
    }
    if (participants.length === 0) {
      setError(t('monitoring.err_no_travelers'));
      return;
    }
    if (!budget || isNaN(Number(budget)) || Number(budget) <= 0) {
      setError(t('monitoring.err_budget_zero'));
      return;
    }

    if ((existingRoutes?.length ?? 0) >= 3 && !showRateLimitWarning) {
      setShowRateLimitWarning(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        origin_iata: origCode,
        destination_code: destCode,
        earliest_date: earliestDate || undefined,
        latest_date: latestDate || undefined,
        min_nights: Number(minNights) || 1,
        max_nights: Number(maxNights) || 30,
        travelers: travelersCount,
        participants: participants,
        max_budget_eur: Number(budget),
        currency: selectedCurrency,
      });
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('monitoring.err_create_failed');
      setError(msg);
      setShowRateLimitWarning(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} data-state={dataState} onClick={handleClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} data-state={dataState} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('monitoring.track_new_route')}</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label={t('monitoring.close_modal')}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {error && (
            <div className={styles.errorMessage} role="alert" aria-live="assertive">
              <div className={styles.errorIcon}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className={styles.errorContent}>
                <span className={styles.errorTag}>{"// CONSTRAINT_VIOLATION"}</span>
                <span className={styles.errorText}>{error}</span>
              </div>
              <button
                type="button"
                className={styles.errorDismissBtn}
                onClick={() => setError(null)}
                aria-label={t('monitoring.dismiss_error')}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}

          {/* Flight Route Corridor Intake from Trip Creation */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>{t('monitoring.corridor_airport_search')}</span>
            </div>
            <RouteIntakeBar
              origin={originCity}
              destination={destCity}
              originIata={originIata}
              destIata={destIata}
              onOriginChange={setOriginCity}
              onDestinationChange={setDestCity}
              onOriginIataChange={setOriginIata}
              onDestIataChange={setDestIata}
              disabled={isSubmitting}
            />
          </div>

          {/* Travelers & Participants Manager from Trip Creation */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>{t('monitoring.travelers_participants')}</span>
              <span className={styles.badgeTravelers}>
                {travelersCount === 1
                  ? t('monitoring.traveler_one', { count: travelersCount })
                  : t('monitoring.traveler_many', { count: travelersCount })}
              </span>
            </div>
            <ParticipantsManager
              participants={participants}
              onChange={setParticipants}
              disabled={isSubmitting}
              currentUserId={user?.id}
              hideHeader={true}
            />
          </div>

          {/* Departure Window (Earliest - Latest) */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>{t('monitoring.departure_dates_window')}</span>
              {(earliestDate || latestDate) ? (
                <button
                  type="button"
                  className={styles.clearDatesBtn}
                  onClick={() => {
                    setEarliestDate('');
                    setLatestDate('');
                  }}
                >
                  {t('monitoring.clear_dates_flexible')}
                </button>
              ) : (
                <span className={styles.flexibleStatusTag}>{t('monitoring.flexible_open_ended')}</span>
              )}
            </div>

            <div className={styles.twoCol}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  {t('monitoring.earliest_departure')}
                </label>
                <div className={styles.datePickerAnchor}>
                  <button
                    type="button"
                    className={`${styles.dateTriggerBtn} ${!earliestDate ? styles.dateTriggerEmpty : ''}`}
                    onClick={() => {
                      setIsEarliestPickerOpen(!isEarliestPickerOpen);
                      setIsLatestPickerOpen(false);
                    }}
                    aria-expanded={isEarliestPickerOpen}
                    aria-label={t('monitoring.select_earliest_date')}
                  >
                    <div className={styles.dateTriggerContent}>
                      <CalendarIcon size={14} color="var(--color-accent-primary)" />
                      <span className={earliestDate ? styles.dateTriggerValue : styles.dateTriggerPlaceholder}>
                        {earliestDate ? formatDisplayDate(earliestDate, locale) : t('monitoring.any_flexible_date')}
                      </span>
                    </div>
                    {earliestDate && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={t('monitoring.clear_earliest_date')}
                        className={styles.clearDateInlineBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEarliestDate('');
                        }}
                      >
                        <CloseIcon size={12} />
                      </span>
                    )}
                  </button>

                  {isEarliestPickerOpen && (
                    <div className={styles.datePickerPopover}>
                      <PaladioSingleDatePicker
                        title={t('monitoring.earliest_departure_upper')}
                        selectedDate={earliestDate}
                        onChange={(d) => {
                          setEarliestDate(d);
                          setIsEarliestPickerOpen(false);
                        }}
                        maxDate={latestDate || undefined}
                        onClose={() => setIsEarliestPickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  {t('monitoring.latest_departure')}
                </label>
                <div className={styles.datePickerAnchor}>
                  <button
                    type="button"
                    className={`${styles.dateTriggerBtn} ${!latestDate ? styles.dateTriggerEmpty : ''}`}
                    onClick={() => {
                      setIsLatestPickerOpen(!isLatestPickerOpen);
                      setIsEarliestPickerOpen(false);
                    }}
                    aria-expanded={isLatestPickerOpen}
                    aria-label={t('monitoring.select_latest_date')}
                  >
                    <div className={styles.dateTriggerContent}>
                      <CalendarIcon size={14} color="var(--color-accent-primary)" />
                      <span className={latestDate ? styles.dateTriggerValue : styles.dateTriggerPlaceholder}>
                        {latestDate ? formatDisplayDate(latestDate, locale) : t('monitoring.any_flexible_date')}
                      </span>
                    </div>
                    {latestDate && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={t('monitoring.clear_latest_date')}
                        className={styles.clearDateInlineBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLatestDate('');
                        }}
                      >
                        <CloseIcon size={12} />
                      </span>
                    )}
                  </button>

                  {isLatestPickerOpen && (
                    <div className={styles.datePickerPopoverRight}>
                      <PaladioSingleDatePicker
                        title={t('monitoring.latest_departure_upper')}
                        selectedDate={latestDate}
                        onChange={(d) => {
                          setLatestDate(d);
                          setIsLatestPickerOpen(false);
                        }}
                        minDate={earliestDate || undefined}
                        onClose={() => setIsLatestPickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stay Duration (Min - Max Nights) */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>{t('monitoring.stay_duration')}</span>
              <div className={styles.durationHeaderActions}>
                <span className={styles.durationValueDisplay}>
                  {minNights === 1 && maxNights === 30
                    ? t('monitoring.any_duration_1_30')
                    : minNights === maxNights
                    ? minNights === 1
                      ? t('monitoring.night_one', { count: minNights })
                      : t('monitoring.night_many', { count: minNights })
                    : t('monitoring.nights_range', { min: minNights, max: maxNights })}
                </span>
                {(minNights !== 1 || maxNights !== 30) && (
                  <button
                    type="button"
                    className={styles.resetDurationBtn}
                    onClick={() => {
                      setMinNights(1);
                      setMaxNights(30);
                    }}
                  >
                    {t('monitoring.reset_to_any')}
                  </button>
                )}
              </div>
            </div>

            <div className="paladio-dual-slider-container" style={{ margin: '8px 0 4px 0', position: 'relative' }}>
              {/* Inactive background track */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: '4px',
                  borderRadius: '9999px',
                  background: 'var(--color-border, #E2D9CC)',
                }}
              />
              {/* Active range colored segment between min and max points */}
              <div
                style={{
                  position: 'absolute',
                  left: `${((minNights - 1) / 29) * 100}%`,
                  width: `${Math.max(0, ((maxNights - minNights) / 29) * 100)}%`,
                  height: '4px',
                  borderRadius: '9999px',
                  background: 'var(--color-accent-primary, #0F4C5C)',
                }}
              />
              {/* Min Handle Point */}
              <input
                type="range"
                className="paladio-range-input"
                aria-label={t('monitoring.min_stay_aria', { nights: minNights })}
                min="1"
                max="30"
                step="1"
                value={minNights}
                style={{ zIndex: minNights > 26 ? 5 : 3 }}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMinNights(Math.min(val, maxNights));
                }}
              />
              {/* Max Handle Point */}
              <input
                type="range"
                className="paladio-range-input"
                aria-label={t('monitoring.max_stay_aria', { nights: maxNights })}
                min="1"
                max="30"
                step="1"
                value={maxNights}
                style={{ zIndex: 4 }}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxNights(Math.max(val, minNights));
                }}
              />
            </div>

            <div className={styles.presetsGrid}>
              {DURATION_PRESETS.map((p) => {
                const isSelected = minNights === p.range[0] && maxNights === p.range[1];
                return (
                  <button
                    key={p.labelKey}
                    type="button"
                    className={`${styles.presetCard} ${isSelected ? styles.presetCardActive : ''}`}
                    onClick={() => {
                      setMinNights(p.range[0]);
                      setMaxNights(p.range[1]);
                    }}
                  >
                    <span className={styles.presetTitle}>{t(p.labelKey)}</span>
                    <span className={styles.presetSub}>{t(p.subKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Ceiling Budget Envelope */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>{t('monitoring.target_budget_envelope')}</span>
              <span className={styles.hint}>{t('monitoring.ceiling_per_passenger')}</span>
            </div>
            <div className={styles.budgetPillContainer}>
              <input
                id="max_budget"
                type="number"
                min={1}
                max={50000}
                step={1}
                value={budget || ''}
                onChange={(e) => setBudget(e.target.value === '' ? 0 : Number(e.target.value))}
                required
                className={styles.budgetInput}
                placeholder="150"
              />
              <button
                type="button"
                onClick={() => setIsCurrencyWheelOpen(true)}
                title={t('monitoring.change_currency_title')}
                className={styles.currencyTriggerBtn}
              >
                <FlagIcon countryCode={getCurrencyInfo(selectedCurrency).flag} size={15} />
                <span>{selectedCurrency}</span>
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  ({getCurrencyInfo(selectedCurrency).symbol})
                </span>
                <SettingsIcon size={12} color="var(--color-text-muted)" />
              </button>
            </div>
          </div>

          {showRateLimitWarning && (
            <div className={styles.warningMessage} role="alertdialog" aria-live="assertive" aria-label={t('monitoring.rate_limit_warning_aria')}>
              <div className={styles.warningIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className={styles.warningContent}>
                <span className={styles.warningTag}>{"// API_RATE_LIMIT_ADVISORY"}</span>
                <span className={styles.warningText}>
                  {t('monitoring.rate_limit_warning_body', { count: existingRoutes?.length ?? 0 })}
                </span>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className={styles.modalFooter}>
            {showRateLimitWarning ? (
              <>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowRateLimitWarning(false)}
                  disabled={isSubmitting}
                >
                  {t('monitoring.go_back')}
                </button>
                <button
                  type="submit"
                  className={styles.proceedWarningBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size={14} />
                      <span>{t('monitoring.configuring_target')}</span>
                    </>
                  ) : (
                    <span>{t('monitoring.proceed_anyway')}</span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size={14} />
                      <span>{t('monitoring.configuring_target')}</span>
                    </>
                  ) : (
                    <span>{t('monitoring.activate_route_monitor')}</span>
                  )}
                </button>
              </>
            )}
          </div>
        </form>

        {/* Currency Wheel Picker Modal from Trip Workspace */}
        <CurrencyWheelPicker
          isOpen={isCurrencyWheelOpen}
          onClose={() => setIsCurrencyWheelOpen(false)}
          selectedCurrency={selectedCurrency}
          onSelectCurrency={(c) => {
            setSelectedCurrency(c.code);
            setIsCurrencyWheelOpen(false);
          }}
        />
      </div>
    </div>
  );
}
