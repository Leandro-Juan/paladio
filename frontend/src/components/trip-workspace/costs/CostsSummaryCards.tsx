"use client";

import React, { useState } from 'react';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { FlagIcon } from './FlagIcon';

interface SummaryCardProps {
  label: string;
  sub: string;
  amount: number;
  currency?: string;
  icon: React.ReactNode;
  tone: 'owe' | 'owed' | 'neutral' | 'total';
  foot: React.ReactNode;
}

function formatMoneyParts(amount: number, currency: string = 'EUR') {
  const cur = (currency || 'EUR').toUpperCase();
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const parts = formatter.formatToParts(amount || 0);
    const integerPart = parts
      .filter((p) => p.type === 'integer' || p.type === 'group' || p.type === 'minusSign')
      .map((p) => p.value)
      .join('');
    const otherPart = parts
      .filter((p) => p.type !== 'integer' && p.type !== 'group' && p.type !== 'minusSign')
      .map((p) => p.value)
      .join('');

    return { integerPart: integerPart || '0', otherPart };
  } catch {
    return { integerPart: `${Math.round(amount)}`, otherPart: ` ${currency}` };
  }
}

function SummaryCard({ label, sub, amount, currency = 'EUR', icon, tone, foot }: SummaryCardProps) {
  const isTotal = tone === 'total';
  const accentColor =
    tone === 'owe'
      ? 'var(--color-danger)'
      : tone === 'owed'
      ? 'var(--color-success)'
      : tone === 'neutral'
      ? 'var(--color-accent-teal, #0D9488)'
      : undefined;

  const { integerPart, otherPart } = formatMoneyParts(amount, currency);

  return (
    <div
      style={{
        borderRadius: '16px',
        padding: '22px 24px',
        position: 'relative',
        overflow: 'hidden',
        background: isTotal
          ? 'var(--color-accent-primary)'
          : 'var(--color-surface-card)',
        color: isTotal ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-main)',
        border: isTotal
          ? '1px solid var(--color-accent-primary)'
          : '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '170px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'grid',
              placeItems: 'center',
              background: isTotal
                ? 'rgba(255, 255, 255, 0.15)'
                : 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
              color: isTotal ? 'var(--color-text-on-accent, #FFFFFF)' : accentColor,
            }}
          >
            {icon}
          </span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '0.88rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: isTotal ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-main)',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.7rem',
                color: isTotal ? 'rgba(255, 255, 255, 0.8)' : 'var(--color-text-muted)',
                letterSpacing: '0.02em',
              }}
            >
              {sub}
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontFeatureSettings: '"tnum"',
            fontSize: '2.4rem',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.1,
            marginTop: '16px',
            display: 'flex',
            alignItems: 'baseline',
            color: isTotal ? 'var(--color-text-on-accent, #FFFFFF)' : accentColor,
          }}
        >
          <span>{integerPart}</span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontFeatureSettings: '"tnum"',
              fontSize: '1.25rem',
              fontWeight: 500,
              marginLeft: '4px',
              color: isTotal ? 'rgba(255, 255, 255, 0.8)' : 'var(--color-text-muted)',
            }}
          >
            {otherPart}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.74rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          color: isTotal ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-muted)',
        }}
      >
        {foot}
      </div>
    </div>
  );
}

/**
 * Split Debt Card: Used when the user is simultaneously owing and owed.
 * Splits the single card into two dedicated halves.
 */
function SplitDebtCard({
  owe,
  owed,
  currency = 'EUR',
}: {
  owe: number;
  owed: number;
  currency?: string;
}) {
  const oweParts = formatMoneyParts(owe, currency);
  const owedParts = formatMoneyParts(owed, currency);

  return (
    <div
      style={{
        borderRadius: '16px',
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface-card)',
        color: 'var(--color-text-main)',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        gap: '14px',
        minHeight: '170px',
      }}
    >
      {/* Left Column: You owe */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontSize: '0.82rem', fontWeight: 600 }}>
                You owe
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                Pay others
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontFeatureSettings: '"tnum"',
              fontSize: '1.85rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              marginTop: '12px',
              display: 'flex',
              alignItems: 'baseline',
              color: 'var(--color-danger)',
            }}
          >
            <span>{oweParts.integerPart}</span>
            <span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '3px', color: 'var(--color-text-muted)' }}>
              {oweParts.otherPart}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem', color: 'var(--color-danger)', fontWeight: 600 }}>
          Payments pending
        </div>
      </div>

      {/* Divider */}
      <div style={{ background: 'var(--color-border-subtle)', height: '100%' }} />

      {/* Right Column: You're owed */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--color-success)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontSize: '0.82rem', fontWeight: 600 }}>
                You&apos;re owed
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                Others pay you
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontFeatureSettings: '"tnum"',
              fontSize: '1.85rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              marginTop: '12px',
              display: 'flex',
              alignItems: 'baseline',
              color: 'var(--color-success)',
            }}
          >
            <span>{owedParts.integerPart}</span>
            <span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '3px', color: 'var(--color-text-muted)' }}>
              {owedParts.otherPart}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600 }}>
          Refunds pending
        </div>
      </div>
    </div>
  );
}

/**
 * Expanded Double Card for Live Currency Converter:
 * Spans 2 slots in the 4-column summary grid.
 * Features SVG flag icons, interactive amount converter, live rate display, and quick wheel trigger.
 */
function CurrencyConverterDoubleCard({
  activeCurrency,
  destinationCurrency,
  destinationCountryCode,
  destinationCountryName,
  exchangeRate,
  isLiveRate,
  onOpenWheelPicker,
}: {
  activeCurrency: string;
  destinationCurrency: string;
  destinationCountryCode?: string;
  destinationCountryName?: string;
  exchangeRate: number;
  isLiveRate: boolean;
  onOpenWheelPicker?: () => void;
}) {
  const [testAmount, setTestAmount] = useState<string>('100');
  const numAmount = parseFloat(testAmount) || 0;
  const convertedAmount = numAmount * exchangeRate;

  const activeInfo = getCurrencyInfo(activeCurrency);
  const destInfo = getCurrencyInfo(destinationCurrency);
  const displayDestCountry = destinationCountryName || destInfo.country;
  const displayDestCountryCode = destinationCountryCode || destInfo.countryCode;

  return (
    <div
      style={{
        borderRadius: '16px',
        padding: '22px 26px',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface-card)',
        color: 'var(--color-text-main)',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '170px',
      }}
    >
      <div>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(15, 76, 92, 0.1)',
                color: 'var(--color-accent-primary, #0F4C5C)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="17" y1="3" x2="17" y2="21" />
                <path d="m21 7-4-4-4 4" />
                <line x1="7" y1="21" x2="7" y2="3" />
                <path d="m3 17 4 4 4-4" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontSize: '0.92rem', fontWeight: 600 }}>
                Live Currency Exchange
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                {activeInfo.country} ➔ {displayDestCountry}
              </div>
            </div>
          </div>

          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '20px',
              background: isLiveRate ? 'rgba(31, 122, 77, 0.12)' : 'rgba(226, 179, 60, 0.18)',
              color: isLiveRate ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-warning, #E2B33C)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isLiveRate ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-warning, #E2B33C)',
              }}
            />
            {isLiveRate ? 'LIVE ECB' : 'AIR-GAPPED'}
          </span>
        </div>

        {/* 2-Column Responsive Body inside the Double Card */}
        <div
          style={{
            marginTop: '16px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: '18px',
            alignItems: 'center',
          }}
        >
          {/* Left Sub-Column: Currency Selector Pill */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
              SELECT ACTIVE CURRENCY
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={onOpenWheelPicker}
                title="Click to spin currency cylinder dial"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
                  border: '1.5px solid var(--color-border-subtle)',
                  borderRadius: '10px',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: 'var(--color-text-main)',
                  transition: 'all 0.15s ease',
                  flex: 1,
                }}
                className="hover:border-teal-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <FlagIcon countryCode={activeInfo.countryCode} width={22} height={15} />
                <span style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontWeight: 650, fontSize: '0.9rem' }}>
                  {activeCurrency}
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  ({activeInfo.symbol})
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono, monospace)' }}>
                ➔
              </span>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.03))',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '10px',
                  padding: '7px 12px',
                  color: 'var(--color-text-main)',
                  flex: 1,
                }}
              >
                <FlagIcon countryCode={displayDestCountryCode} width={22} height={15} />
                <span style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontWeight: 650, fontSize: '0.9rem' }}>
                  {destinationCurrency}
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  ({destInfo.symbol})
                </span>
              </div>
            </div>
          </div>

          {/* Right Sub-Column: Live Quick Amount Converter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
              LIVE CONVERSION
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.85rem',
                background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{activeInfo.symbol}</span>
                <input
                  type="number"
                  min="0"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  aria-label="Currency amount to convert"
                  style={{
                    width: '64px',
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'inherit',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    outline: 'none',
                  }}
                />
              </div>

              <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>=</span>

              <div style={{ fontWeight: 700, color: 'var(--color-accent-teal-deep, #0F4C5C)' }}>
                {destInfo.symbol}
                {convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Exchange Ratio Note (spin dial text removed per user instruction) */}
      <div
        style={{
          marginTop: '14px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.72rem',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>
          Live rate: 1 {activeCurrency} = {exchangeRate.toFixed(4)} {destinationCurrency}
        </span>
        <span>·</span>
        <span>
          1 {destinationCurrency} = {(1 / (exchangeRate || 1)).toFixed(4)} {activeCurrency}
        </span>
      </div>
    </div>
  );
}

export interface CostsTotals {
  owe: number;
  owed: number;
  totalSpend: number;
  myShare: number;
  myPaid: number;
  currency?: string;
  outstanding?: number;
  outstandingCount?: number;
}

interface CostsSummaryCardsProps {
  totals: CostsTotals;
  activeCurrency?: string;
  destinationCurrency?: string;
  destinationCountryCode?: string;
  destinationCountryName?: string;
  exchangeRate?: number;
  isLiveRate?: boolean;
  onOpenCurrencyPicker?: () => void;
}

export function CostsSummaryCards({
  totals,
  activeCurrency = 'EUR',
  destinationCurrency = 'EUR',
  destinationCountryCode,
  destinationCountryName,
  exchangeRate = 1.0,
  isLiveRate = true,
  onOpenCurrencyPicker,
}: CostsSummaryCardsProps) {
  const currency = totals.currency || activeCurrency || 'EUR';

  const hasOwe = totals.owe > 0.01;
  const hasOwed = totals.owed > 0.01;

  return (
    <div
      style={{
        display: 'grid',
        // 4 Columns on desktop: Double card takes 2, Merged debt takes 1, Total spend takes 1
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '26px',
      }}
      className="summary-cards-grid"
    >
      <style>{`
        @media (min-width: 1024px) {
          .summary-cards-grid {
            grid-template-columns: 2fr 1fr 1fr !important;
          }
        }
      `}</style>

      {/* 1. Double Card: Live Currency Converter (spans 2 columns) */}
      <CurrencyConverterDoubleCard
        activeCurrency={activeCurrency}
        destinationCurrency={destinationCurrency}
        destinationCountryCode={destinationCountryCode}
        destinationCountryName={destinationCountryName}
        exchangeRate={exchangeRate}
        isLiveRate={isLiveRate}
        onOpenWheelPicker={onOpenCurrencyPicker}
      />

      {/* 2. Single Card (Original Size): Merged Debt / Settlement Card */}
      {hasOwe && hasOwed ? (
        // State 4: Both owing and owed -> Split into two dedicated halves
        <SplitDebtCard owe={totals.owe} owed={totals.owed} currency={currency} />
      ) : hasOwe ? (
        // State 2: Only owing -> Use existing "You owe" style
        <SummaryCard
          label="You owe"
          sub="You should pay others"
          amount={totals.owe}
          currency={currency}
          tone="owe"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          }
          foot={
            <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
              Payments pending
            </span>
          }
        />
      ) : hasOwed ? (
        // State 1: Only owed -> Use existing "You're owed" style
        <SummaryCard
          label="You're owed"
          sub="Others should pay you"
          amount={totals.owed}
          currency={currency}
          tone="owed"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          }
          foot={
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
              Refunds pending
            </span>
          }
        />
      ) : (
        // State 3: Neutral -> All settled up
        <SummaryCard
          label="All settled up"
          sub="Balance neutral"
          amount={0}
          currency={currency}
          tone="neutral"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          foot={
            <span style={{ color: 'var(--color-text-muted)' }}>
              Nothing owed or owing
            </span>
          }
        />
      )}

      {/* 3. Single Card (Original Size): Total Trip Spend */}
      <SummaryCard
        label="Total trip spend"
        sub="Across all travelers"
        amount={totals.totalSpend}
        currency={currency}
        tone="total"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        }
        foot={
          <div style={{ display: 'flex', gap: '14px', width: '100%', flexWrap: 'wrap' }}>
            <span>
              Your share:{' '}
              <b style={{ color: 'var(--color-text-on-accent)' }}>
                {formatMoneyParts(totals.myShare, currency).integerPart}
                {formatMoneyParts(totals.myShare, currency).otherPart}
              </b>
            </span>
            <span>·</span>
            <span>
              You paid:{' '}
              <b style={{ color: 'var(--color-text-on-accent)' }}>
                {formatMoneyParts(totals.myPaid, currency).integerPart}
                {formatMoneyParts(totals.myPaid, currency).otherPart}
              </b>
            </span>
          </div>
        }
      />
    </div>
  );
}
