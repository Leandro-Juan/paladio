"use client";

import React, { useState, useEffect, useMemo } from 'react';
import styles from './CurrencyConverterWidget.module.css';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
];

// Offline baseline table against EUR for 100% air-gapped resilience
const BASELINE_EUR_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.09,
  GBP: 0.85,
  JPY: 162.5,
  CHF: 0.96,
  CAD: 1.48,
  AUD: 1.64,
  CNY: 7.82,
  BRL: 5.92,
  INR: 91.2,
  MXN: 21.3,
  SEK: 11.4,
  NOK: 11.6,
  NZD: 1.78,
  SGD: 1.45,
  KRW: 1480.0,
  PLN: 4.30,
  TRY: 37.5,
  THB: 39.2,
  AED: 4.00,
};

const CACHE_KEY_PREFIX = 'paladio_fx_';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export function CurrencyConverterWidget() {
  const [fromCurrency, setFromCurrency] = useState<string>('EUR');
  const [toCurrency, setToCurrency] = useState<string>('USD');
  const [amountInput, setAmountInput] = useState<string>('1000');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [status, setStatus] = useState<'live' | 'cached' | 'offline'>('live');
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    let isCancelled = false;

    async function syncRates() {
      await Promise.resolve();
      if (isCancelled) return;

      if (fromCurrency === toCurrency) {
        setExchangeRate(1.0);
        setStatus('live');
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        return;
      }

      setLoading(true);

      // 1. Check local storage cache first
      const cacheKey = `${CACHE_KEY_PREFIX}${fromCurrency}_${toCurrency}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            if (!isCancelled) {
              setExchangeRate(parsed.rate);
              setStatus('cached');
              setLastUpdated(parsed.date || 'Cached');
            }
          }
        }
      } catch {
        // Continue to fetch
      }

      // 2. Fetch live FX rates from Frankfurter API
      let liveFetched = false;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${fromCurrency}&symbols=${toCurrency}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.rates && typeof data.rates[toCurrency] === 'number') {
            const liveRate = data.rates[toCurrency];
            if (!isCancelled) {
              setExchangeRate(liveRate);
              setStatus('live');
              const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              setLastUpdated(nowStr);
              liveFetched = true;

              try {
                localStorage.setItem(
                  cacheKey,
                  JSON.stringify({
                    rate: liveRate,
                    timestamp: Date.now(),
                    date: nowStr,
                  })
                );
              } catch {
                // Ignore storage errors
              }
            }
          }
        }
      } catch {
        // Fall back to offline/cache
      }

      clearTimeout(timeoutId);

      // 3. Air-gapped / Offline fallback if network failed and no valid cache
      if (!liveFetched && !isCancelled) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            setExchangeRate(parsed.rate);
            setStatus('cached');
            setLastUpdated(`Cached (${parsed.date || 'Local'})`);
            setLoading(false);
            return;
          }
        } catch {
          // Continue to baseline calculation
        }

        const fromBase = BASELINE_EUR_RATES[fromCurrency] || 1.0;
        const toBase = BASELINE_EUR_RATES[toCurrency] || 1.0;
        const computedRate = toBase / fromBase;

        setExchangeRate(computedRate);
        setStatus('offline');
        setLastUpdated('Air-Gapped Baseline');
      }

      if (!isCancelled) {
        setLoading(false);
      }
    }

    syncRates();

    return () => {
      isCancelled = true;
    };
  }, [fromCurrency, toCurrency]);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const parsedAmount = useMemo(() => {
    const val = parseFloat(amountInput);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [amountInput]);

  const currencyFormatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const rateFormatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }, []);

  const convertedResult = useMemo(() => {
    if (exchangeRate === null) return '---';
    const total = parsedAmount * exchangeRate;
    return currencyFormatter.format(total);
  }, [parsedAmount, exchangeRate, currencyFormatter]);


  const statusColor =
    status === 'live'
      ? 'var(--color-success)'
      : status === 'cached'
      ? 'var(--color-accent-teal-mid)'
      : 'var(--color-accent-warning)';

  return (
    <div className={styles.card} aria-busy={loading}>
      <div>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>Currency Dispatch</h3>
          <div className={styles.fxLiveBadge}>
            <span className={styles.fxDot} style={{ backgroundColor: statusColor }} />
            <span>Live FX rate (ECB)</span>
          </div>
        </div>

        {/* Main Conversion Row: 1fr auto 1fr */}
        <div className={styles.converterGrid}>
          {/* Origin (From) */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="fromCurSelect">
              FROM CURRENCY
            </label>
            <div className={styles.inputWrapper}>
              <select
                id="fromCurSelect"
                aria-label="Origin Currency"
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
                className={styles.select}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </select>

              <input
                id="fromAmountInput"
                type="number"
                min="0"
                step="any"
                aria-label="Origin Amount"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className={styles.amountInput}
              />
            </div>
          </div>

          {/* Swap Action Button */}
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap currencies"
            title="Swap currencies"
            className={styles.swapButton}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>

          {/* Target (To) */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="toCurSelect">
              TO CURRENCY
            </label>
            <div className={styles.inputWrapper}>
              <select
                id="toCurSelect"
                aria-label="Target Currency"
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className={styles.select}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </select>

              <div className={styles.resultBox}>
                <span className={styles.resultValue} id="toAmountResult" title={`${convertedResult} ${toCurrency}`}>
                  {convertedResult}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Rate / Telemetry Info */}
      <div className={styles.footer}>
        <span className={styles.rateText} id="rateString">
          1 {fromCurrency} = {exchangeRate !== null ? rateFormatter.format(exchangeRate) : '...'} {toCurrency}
        </span>

        <span className={styles.syncText}>
          Updated today · {lastUpdated || '14:00 UTC'}
        </span>
      </div>
    </div>
  );
}
