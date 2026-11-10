"use client";

import React, { useState, useEffect } from 'react';
import { CloseIcon, Spinner, SettingsIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { RouteIntakeBar } from '@/components/trip-creation/RouteIntakeBar';
import { ParticipantsManager, SelectedParticipant } from '@/components/trip-creation/ParticipantsManager';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import styles from './NewRouteModal.module.css';

interface NewRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDefaultCurrency?: string;
  onSubmit: (data: {
    origin_iata: string;
    destination_code: string;
    earliest_date: string;
    latest_date: string;
    min_nights: number;
    max_nights: number;
    travelers: number;
    participants?: SelectedParticipant[];
    max_budget_eur: number;
    currency?: string;
  }) => Promise<unknown>;
}

export function NewRouteModal({ isOpen, onClose, userDefaultCurrency, onSubmit }: NewRouteModalProps) {
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
  const [minNights, setMinNights] = useState<number>(2);
  const [maxNights, setMaxNights] = useState<number>(5);
  const [budget, setBudget] = useState<number>(150);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialCurrency);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize participants with current user as organizer
  const [participants, setParticipants] = useState<SelectedParticipant[]>(() => {
    if (!user) return [];
    return [
      {
        id: user.id || 'organizer',
        name: (user as { name?: string }).name || user.username || 'Organizer',
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
            name: (user as { name?: string }).name || user.username || 'Organizer',
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

  if (!isOpen) return null;

  const travelersCount = Math.max(1, participants.length);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const origCode = (originIata || originCity).trim().toUpperCase();
    const destCode = (destIata || destCity).trim().toUpperCase();

    if (!origCode || origCode.length !== 3) {
      setError('Origin must be a 3-letter IATA code (e.g. MAD, BCN, DUB)');
      return;
    }
    if (!destCode || destCode.length < 3) {
      setError('Destination must be a valid airport or city code (e.g. FCO, DUB, OPO)');
      return;
    }
    if (new Date(earliestDate) > new Date(latestDate)) {
      setError('Earliest departure date must be before latest departure date');
      return;
    }
    if (participants.length === 0) {
      setError('At least one traveler or participant must be added to the monitored route.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        origin_iata: origCode,
        destination_code: destCode,
        earliest_date: earliestDate,
        latest_date: latestDate,
        min_nights: Number(minNights),
        max_nights: Number(maxNights),
        travelers: travelersCount,
        participants: participants,
        max_budget_eur: Number(budget),
        currency: selectedCurrency,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create route monitor';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.telemetryTag} aria-hidden="true">{"// NEW_MONITOR_TARGET"}</span>
            <h3 className={styles.modalTitle}>Track New Airfare Route</h3>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          {/* Flight Route Corridor Intake from Trip Creation */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionLabel}>
              <span>Flight Route Corridor & Airport Search</span>
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
              <span>Travelers & Participants</span>
              <span className={styles.badgeTravelers}>
                {travelersCount} {travelersCount === 1 ? 'Traveler' : 'Travelers'}
              </span>
            </div>
            <ParticipantsManager
              participants={participants}
              onChange={setParticipants}
              disabled={isSubmitting}
              currentUserId={user?.id}
            />
          </div>

          {/* Departure Window (Earliest - Latest) */}
          <div className={styles.twoCol}>
            <div className={styles.inputGroup}>
              <label htmlFor="earliest_date" className={styles.label}>
                Earliest Departure Window
              </label>
              <input
                id="earliest_date"
                type="date"
                value={earliestDate}
                onChange={(e) => setEarliestDate(e.target.value)}
                required
                className={styles.input}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="latest_date" className={styles.label}>
                Latest Departure Window
              </label>
              <input
                id="latest_date"
                type="date"
                value={latestDate}
                onChange={(e) => setLatestDate(e.target.value)}
                required
                className={styles.input}
              />
            </div>
          </div>

          {/* Stay Duration & Budget Envelope */}
          <div className={styles.twoCol}>
            <div className={styles.inputGroup}>
              <label htmlFor="min_nights" className={styles.label}>
                Stay Duration (Min - Max Nights)
              </label>
              <div className={styles.rangeInputs}>
                <input
                  id="min_nights"
                  type="number"
                  min={1}
                  max={maxNights}
                  value={minNights}
                  onChange={(e) => setMinNights(Number(e.target.value))}
                  required
                  className={styles.input}
                />
                <span className={styles.rangeSeparator}>to</span>
                <input
                  id="max_nights"
                  type="number"
                  min={minNights}
                  max={30}
                  value={maxNights}
                  onChange={(e) => setMaxNights(Number(e.target.value))}
                  required
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Target Ceiling Budget Envelope
              </label>
              <div className={styles.budgetPillContainer}>
                <input
                  id="max_budget"
                  type="number"
                  min={1}
                  max={50000}
                  step={10}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  required
                  className={styles.budgetInput}
                  placeholder="150"
                />
                <button
                  type="button"
                  onClick={() => setIsCurrencyWheelOpen(true)}
                  title="Change currency with dynamic spin dial"
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
          </div>

          {/* Modal Actions */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size={14} />
                  <span>Configuring Target...</span>
                </>
              ) : (
                <span>Activate Route Monitor</span>
              )}
            </button>
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
