"use client";

import React from 'react';

interface SummaryCardProps {
  label: string;
  sub: string;
  amount: number;
  currency?: string;
  icon: React.ReactNode;
  tone: 'owe' | 'owed' | 'unfinished' | 'total';
  foot: React.ReactNode;
}

function formatMoneyParts(amount: number, currency: string = 'EUR') {
  const cur = currency.toUpperCase();
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
      ? '#DC2626'
      : tone === 'owed'
      ? '#059669'
      : tone === 'unfinished'
      ? '#D97706'
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
          ? 'linear-gradient(135deg, #0F172A 0%, #172554 60%, #1E3A8A 100%)'
          : '#FFFFFF',
        color: isTotal ? '#FFFFFF' : 'inherit',
        border: isTotal
          ? '1px solid rgba(255, 255, 255, 0.12)'
          : '1px solid var(--color-border, #E2E8F0)',
        boxShadow: isTotal
          ? '0 10px 25px -5px rgba(30, 58, 138, 0.25)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
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
                ? 'rgba(255, 255, 255, 0.12)'
                : `${accentColor}14`,
              color: isTotal ? '#FFFFFF' : accentColor,
            }}
          >
            {icon}
          </span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display, "Outfit", sans-serif)',
                fontSize: '0.88rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: isTotal ? '#FFFFFF' : 'var(--color-text-primary, #0F172A)',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: '0.7rem',
                color: isTotal ? 'rgba(255, 255, 255, 0.65)' : 'var(--color-text-muted, #64748B)',
                letterSpacing: '0.02em',
              }}
            >
              {sub}
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-display, "Outfit", sans-serif)',
            fontSize: '2.5rem',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.1,
            marginTop: '16px',
            display: 'flex',
            alignItems: 'baseline',
            color: isTotal ? '#FFFFFF' : accentColor,
          }}
        >
          <span>{integerPart}</span>
          <span
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: '1.25rem',
              fontWeight: 500,
              marginLeft: '4px',
              color: isTotal ? 'rgba(255, 255, 255, 0.7)' : 'var(--color-text-muted, #64748B)',
            }}
          >
            {otherPart}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          fontSize: '0.74rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          color: isTotal ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-muted, #64748B)',
        }}
      >
        {foot}
      </div>
    </div>
  );
}

export interface CostsTotals {
  owe: number;
  owed: number;
  outstanding: number;
  outstandingCount: number;
  totalSpend: number;
  myShare: number;
  myPaid: number;
  currency?: string;
}

interface CostsSummaryCardsProps {
  totals: CostsTotals;
}

export function CostsSummaryCards({ totals }: CostsSummaryCardsProps) {
  const currency = totals.currency || 'EUR';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '16px',
        marginBottom: '26px',
      }}
    >
      {/* 1. You Owe */}
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
          totals.owe > 0.01 ? (
            <span style={{ color: '#DC2626', fontWeight: 600 }}>Payments pending</span>
          ) : (
            <span style={{ color: '#94A3B8' }}>You&apos;re all settled up</span>
          )
        }
      />

      {/* 2. You're Owed */}
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
          totals.owed > 0.01 ? (
            <span style={{ color: '#059669', fontWeight: 600 }}>Refunds pending</span>
          ) : (
            <span style={{ color: '#94A3B8' }}>Nothing owed to you</span>
          )
        }
      />

      {/* 3. Outstanding Amount */}
      <SummaryCard
        label="Outstanding amount"
        sub="Expenses with no payer yet"
        amount={totals.outstanding}
        currency={currency}
        tone="unfinished"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        }
        foot={
          totals.outstandingCount > 0 ? (
            <span>
              <b style={{ color: '#D97706' }}>{totals.outstandingCount}</b> expense
              {totals.outstandingCount !== 1 ? 's' : ''} need a payer
            </span>
          ) : (
            <span style={{ color: '#94A3B8' }}>All items assigned</span>
          )
        }
      />

      {/* 4. Total Trip Spend */}
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
              <b style={{ color: '#FFFFFF' }}>
                €{totals.myShare.toFixed(0)}
              </b>
            </span>
            <span>·</span>
            <span>
              You paid:{' '}
              <b style={{ color: '#FFFFFF' }}>
                €{totals.myPaid.toFixed(0)}
              </b>
            </span>
          </div>
        }
      />
    </div>
  );
}
