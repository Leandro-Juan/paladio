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
  const [amountInput, setAmountInput] = useState<string>('1');
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

  const fromSymbol = useMemo(() => {
    return SUPPORTED_CURRENCIES.find((c) => c.code === fromCurrency)?.symbol || fromCurrency;
  }, [fromCurrency]);

  const toSymbol = useMemo(() => {
    return SUPPORTED_CURRENCIES.find((c) => c.code === toCurrency)?.symbol || toCurrency;
  }, [toCurrency]);

  const statusColor =
    status === 'live'
      ? 'var(--color-success)'
      : status === 'cached'
      ? 'var(--color-accent-teal-mid)'
      : 'var(--color-accent-warning)';

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>CURRENCY CONVERSION</h3>
          <p className={styles.subtitle}>{'// SOVEREIGN FX & RATE CONVERTER'}</p>
        </div>

        <div className={styles.fxIndicator} style={{ color: statusColor }}>
          <span className={styles.fxDot} style={{ backgroundColor: statusColor }} />
          <span>
            {loading ? 'SYNCING...' : status === 'live' ? 'LIVE FX' : status === 'cached' ? 'CACHED' : 'AIR-GAPPED'}
          </span>
        </div>
      </div>

      {/* Main Conversion Row: 1fr auto 1fr */}
      <div className={styles.converterGrid}>
        {/* Origin (From) */}
        <div className={styles.currencyField}>
          <span className={styles.fieldLabel}>ORIGIN [FROM]</span>
          <select
            aria-label="Origin Currency"
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            className={styles.select}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          <div className={styles.amountRow}>
            <span className={styles.currencySymbol}>{fromSymbol}</span>
            <input
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
          title="Swap origin and destination currencies"
          className={styles.swapButton}
        >
          ⇄
        </button>

        {/* Target (To) */}
        <div className={styles.currencyField}>
          <span className={styles.fieldLabel}>TARGET [TO]</span>
          <select
            aria-label="Target Currency"
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            className={styles.select}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          <div className={styles.amountRow}>
            <span className={styles.currencySymbol}>{toSymbol}</span>
            <span className={styles.resultValue} title={`${convertedResult} ${toCurrency}`}>
              {convertedResult}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Rate / Telemetry Info */}
      <div className={styles.footer}>
        <span className={styles.rateText}>
          EXCHANGE RATIO:{' '}
          <strong className={styles.rateValue}>
            1 {fromCurrency} = {exchangeRate !== null ? rateFormatter.format(exchangeRate) : '...'} {toCurrency}
          </strong>
          {exchangeRate !== null && exchangeRate !== 0 && (
            <span style={{ marginLeft: '8px', opacity: 0.8 }}>
              (1 {toCurrency} = {rateFormatter.format(1 / exchangeRate)} {fromCurrency})
            </span>
          )}
        </span>

        <span className={styles.syncText}>
          SYNC: {lastUpdated || 'INITIALIZING'}
        </span>
      </div>
    </div>
  );
}
