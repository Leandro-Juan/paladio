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
      ? 'var(--color-danger)'
      : tone === 'owed'
      ? 'var(--color-success)'
      : tone === 'unfinished'
      ? 'var(--color-accent-secondary)'
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
        color: isTotal ? 'var(--color-text-on-accent)' : 'var(--color-text-main)',
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
              color: isTotal ? 'var(--color-text-on-accent)' : accentColor,
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
                color: isTotal ? 'var(--color-text-on-accent)' : 'var(--color-text-main)',
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
            fontSize: '2.5rem',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.1,
            marginTop: '16px',
            display: 'flex',
            alignItems: 'baseline',
            color: isTotal ? 'var(--color-text-on-accent)' : accentColor,
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
            <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Payments pending</span>
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>You&apos;re all settled up</span>
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
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Refunds pending</span>
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>Nothing owed to you</span>
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
              <b style={{ color: 'var(--color-accent-secondary)' }}>{totals.outstandingCount}</b> expense
              {totals.outstandingCount !== 1 ? 's' : ''} need a payer
            </span>
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>All items assigned</span>
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
              <b style={{ color: 'var(--color-text-on-accent)' }}>
                €{totals.myShare.toFixed(0)}
              </b>
            </span>
            <span>·</span>
            <span>
              You paid:{' '}
              <b style={{ color: 'var(--color-text-on-accent)' }}>
                €{totals.myPaid.toFixed(0)}
              </b>
            </span>
          </div>
        }
      />
    </div>
  );
}
