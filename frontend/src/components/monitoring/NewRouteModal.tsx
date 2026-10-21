"use client";

import React, { useState } from 'react';
import { CloseIcon, Spinner } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { SUPPORTED_CURRENCY_LIST, getCurrencyInfo } from '@/utils/currencyResolver';
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

  const [origin, setOrigin] = useState<string>('MAD');
  const [destination, setDestination] = useState<string>('FCO');
  const [earliestDate, setEarliestDate] = useState<string>(defaultEarliest);
  const [latestDate, setLatestDate] = useState<string>(defaultLatest);
  const [minNights, setMinNights] = useState<number>(2);
  const [maxNights, setMaxNights] = useState<number>(5);
  const [budget, setBudget] = useState<number>(120);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialCurrency);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!origin || origin.length !== 3) {
      setError('Origin must be a 3-letter IATA code (e.g. MAD, BCN, DUB)');
      return;
    }
    if (!destination || destination.length < 3) {
      setError('Destination must be an airport or city code (e.g. FCO, DUB, OPO)');
      return;
    }
    if (new Date(earliestDate) > new Date(latestDate)) {
      setError('Earliest departure date must be before latest departure date');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        origin_iata: origin.trim().toUpperCase(),
        destination_code: destination.trim().toUpperCase(),
        earliest_date: earliestDate,
        latest_date: latestDate,
        min_nights: Number(minNights),
        max_nights: Number(maxNights),
        travelers: 1,
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

          <div className={styles.twoCol}>
            <div className={styles.inputGroup}>
              <label htmlFor="origin_iata" className={styles.label}>
                Origin IATA Code
              </label>
              <input
                id="origin_iata"
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                placeholder="MAD"
                maxLength={3}
                required
                className={styles.input}
              />
              <span className={styles.hint}>e.g. MAD (Madrid), BCN (Barcelona)</span>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="destination_code" className={styles.label}>
                Destination Code
              </label>
              <input
                id="destination_code"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                placeholder="FCO"
                maxLength={10}
                required
                className={styles.input}
              />
              <span className={styles.hint}>e.g. FCO (Rome), DUB (Dublin), OPO</span>
            </div>
          </div>

          <div className={styles.twoCol}>
            <div className={styles.inputGroup}>
              <label htmlFor="earliest_date" className={styles.label}>
                Earliest Departure
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
                Latest Departure
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
              <label htmlFor="currency_select" className={styles.label}>
                Currency
              </label>
              <select
                id="currency_select"
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className={styles.input}
              >
                {SUPPORTED_CURRENCY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol}) - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="max_budget" className={styles.label}>
                Target Ceiling Budget ({getCurrencyInfo(selectedCurrency).symbol} {selectedCurrency})
              </label>
              <input
                id="max_budget"
                type="number"
                min={1}
                max={50000}
                step={5}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                required
                className={styles.input}
              />
            </div>
          </div>

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
                  <span>Scanning & Activating...</span>
                </>
              ) : (
                <span>Activate Route Monitor</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
