"use client";

import React, { useState, useEffect, useMemo } from 'react';

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
      // Asynchronous microtask separation to avoid cascading synchronous renders
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
        // Ignore localStorage read errors in restricted contexts
      }

      // 2. Fetch live rate from free Frankfurter ECB API
      let liveFetched = false;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const endpoints = [
        `https://api.frankfurter.dev/v1/latest?from=${fromCurrency}&to=${toCurrency}`,
        `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`,
      ];

      for (const url of endpoints) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (response.ok) {
            const data = await response.json();
            if (data && data.rates && typeof data.rates[toCurrency] === 'number') {
              const rate = data.rates[toCurrency];
              if (!isCancelled) {
                setExchangeRate(rate);
                setStatus('live');
                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setLastUpdated(`Live (${nowStr})`);
              }

              try {
                localStorage.setItem(
                  cacheKey,
                  JSON.stringify({
                    rate,
                    date: data.date || new Date().toISOString().slice(0, 10),
                    timestamp: Date.now(),
                  })
                );
              } catch {
                // Ignore cache write errors
              }

              liveFetched = true;
              break;
            }
          }
        } catch {
          // Try next endpoint or continue
        }
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

  const convertedResult = useMemo(() => {
    if (exchangeRate === null) return '---';
    const total = parsedAmount * exchangeRate;
    if (total >= 1000) {
      return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }, [parsedAmount, exchangeRate]);

  const fromSymbol = useMemo(() => {
    return SUPPORTED_CURRENCIES.find((c) => c.code === fromCurrency)?.symbol || fromCurrency;
  }, [fromCurrency]);

  const toSymbol = useMemo(() => {
    return SUPPORTED_CURRENCIES.find((c) => c.code === toCurrency)?.symbol || toCurrency;
  }, [toCurrency]);

  return (
    <div
      className="bg-surface border-subtle"
      style={{
        padding: '1.5rem',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '200px',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 className="font-display" style={{ fontSize: '1.1rem', margin: 0 }}>CURRENCY CONVERSION</h3>
          <p className="font-mono text-muted text-xs mt-1">{'// SOVEREIGN FX & RATE CONVERTER'}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="font-mono text-xs"
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 600,
              background:
                status === 'live'
                  ? 'rgba(34, 197, 94, 0.12)'
                  : status === 'cached'
                  ? 'rgba(59, 130, 246, 0.12)'
                  : 'rgba(217, 119, 6, 0.12)',
              color:
                status === 'live'
                  ? '#16A34A'
                  : status === 'cached'
                  ? '#2563EB'
                  : '#D97706',
              border: `1px solid ${
                status === 'live'
                  ? 'rgba(34, 197, 94, 0.3)'
                  : status === 'cached'
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'rgba(217, 119, 6, 0.3)'
              }`,
            }}
          >
            {loading ? '● SYNCING...' : status === 'live' ? '● LIVE FX' : status === 'cached' ? '⚡ CACHED' : '○ AIR-GAPPED'}
          </span>
        </div>
      </div>

      {/* Main Conversion Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '1rem',
          alignItems: 'center',
          marginTop: '1rem',
          marginBottom: '1rem',
        }}
      >
        {/* Origin (From) Card */}
        <div
          style={{
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-mono text-muted" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>
              ORIGIN [FROM]
            </span>
            <select
              aria-label="Origin Currency"
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="font-mono"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '1rem' }}>
              {fromSymbol}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              aria-label="Origin Amount"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="font-mono"
              style={{
                width: '100%',
                fontSize: '1.4rem',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
        </div>

        {/* Swap Action Button */}
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap currencies"
          title="Swap origin and destination currencies"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-accent-primary)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ⇄
        </button>

        {/* Target (To) Card */}
        <div
          style={{
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-mono text-muted" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>
              TARGET [TO]
            </span>
            <select
              aria-label="Target Currency"
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="font-mono"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', overflow: 'hidden' }}>
            <span className="font-mono text-muted" style={{ fontSize: '1rem' }}>
              {toSymbol}
            </span>
            <span
              className="font-mono"
              title={`${convertedResult} ${toCurrency}`}
              style={{
                fontSize: '1.4rem',
                fontWeight: 600,
                color: 'var(--color-accent-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {convertedResult}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Rate / Telemetry Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px dashed var(--color-border)',
          fontSize: '0.75rem',
        }}
      >
        <span className="font-mono text-muted">
          EXCHANGE RATIO:{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>
            1 {fromCurrency} = {exchangeRate !== null ? exchangeRate.toFixed(4) : '...'} {toCurrency}
          </strong>
          {exchangeRate !== null && exchangeRate !== 0 && (
            <span style={{ marginLeft: '8px', opacity: 0.8 }}>
              (1 {toCurrency} = {(1 / exchangeRate).toFixed(4)} {fromCurrency})
            </span>
          )}
        </span>

        <span className="font-mono text-muted text-xs">
          SYNC: {lastUpdated || 'INITIALIZING'}
        </span>
      </div>
    </div>
  );
}
