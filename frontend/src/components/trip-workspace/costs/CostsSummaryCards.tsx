"use client";

import React, { useState, useMemo } from 'react';
import { getCurrencyInfo, getLocalizedCurrencyCountry } from '@/utils/currencyResolver';
import { FlagIcon } from './FlagIcon';
import { ArrowRightIcon } from '@/components/icons';
import { DisplayExpenseItem } from './ExpenseRow';
import { useTranslation } from '@/hooks/useTranslation';

interface SummaryCardProps {
  label: string;
  sub: string;
  amount: number;
  targetAmount?: number;
  currency?: string;
  icon: React.ReactNode;
  tone: 'owe' | 'owed' | 'neutral' | 'total';
  foot: React.ReactNode;
}

function formatMoneyParts(amount: number, currency: string = 'EUR', intlLocale: string = 'en-US') {
  const cur = (currency || 'EUR').toUpperCase();
  try {
    const formatter = new Intl.NumberFormat(intlLocale, {
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

function SummaryCard({ label, sub, amount, targetAmount, currency = 'EUR', icon, tone, foot }: SummaryCardProps) {
  const { locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const isTotal = tone === 'total';
  const accentColor =
    tone === 'owe'
      ? 'var(--color-danger)'
      : tone === 'owed'
      ? 'var(--color-success)'
      : tone === 'neutral'
      ? 'var(--color-accent-teal, #0D9488)'
      : undefined;

  const { integerPart, otherPart } = formatMoneyParts(amount, currency, intlLocale);

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
            flexWrap: 'wrap',
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
              color: isTotal ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-muted)',
            }}
          >
            {otherPart}
          </span>
          {targetAmount !== undefined && targetAmount > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontFeatureSettings: '"tnum"',
                fontSize: '1.15rem',
                fontWeight: 500,
                color: isTotal ? '#94A3B8' : 'var(--color-text-muted, #8E9A9F)',
                marginLeft: '6px',
              }}
            >
              / {formatMoneyParts(targetAmount, currency, intlLocale).integerPart}{formatMoneyParts(targetAmount, currency, intlLocale).otherPart}
            </span>
          )}
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
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const oweParts = formatMoneyParts(owe, currency, intlLocale);
  const owedParts = formatMoneyParts(owed, currency, intlLocale);

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
                {t('costs.you_owe')}
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                {t('costs.pay_others')}
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
          {t('costs.payments_pending')}
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
                {t('costs.youre_owed')}
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                {t('costs.others_pay_you')}
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
          {t('costs.refunds_pending')}
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
interface ModeToggleProps {
  mode: 'pace' | 'fx';
  onChange: (mode: 'pace' | 'fx') => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.05))',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '20px',
        padding: '2px',
        gap: '2px',
      }}
    >
      <button
        type="button"
        onClick={() => onChange('pace')}
        title={t('costs.mode_pace_title')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '16px',
          padding: '3px 9px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.66rem',
          fontWeight: mode === 'pace' ? 650 : 500,
          background: mode === 'pace' ? 'var(--color-surface-card)' : 'transparent',
          color: mode === 'pace' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
          boxShadow: mode === 'pace' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        {t('costs.mode_pace')}
      </button>

      <button
        type="button"
        data-testid="costs-fx-toggle-btn"
        onClick={() => onChange('fx')}
        title={t('costs.mode_fx_title')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '16px',
          padding: '3px 9px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.66rem',
          fontWeight: mode === 'fx' ? 650 : 500,
          background: mode === 'fx' ? 'var(--color-surface-card)' : 'transparent',
          color: mode === 'fx' ? 'var(--color-text-main)' : 'var(--color-text-muted)',
          boxShadow: mode === 'fx' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="17" y1="3" x2="17" y2="21" />
          <path d="m21 7-4-4-4 4" />
          <line x1="7" y1="21" x2="7" y2="3" />
          <path d="m3 17 4 4 4-4" />
        </svg>
        {t('costs.mode_fx')}
      </button>
    </div>
  );
}

export interface DailySpendingPoint {
  dateKey: string;
  dayIndex: number;
  dayLabel: string;
  dateLabel: string;
  amount: number;
  expenseCount: number;
  isToday: boolean;
  isOverTarget: boolean;
}

function DailyExpensesGraph({
  points,
  dailyAllowance,
  activeCurrency,
  tripTotalDays,
  totalSpend,
}: {
  points: DailySpendingPoint[];
  dailyAllowance: number;
  activeCurrency: string;
  tripTotalDays?: number;
  totalSpend?: number;
}) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxAmount = useMemo(() => Math.max(0, ...points.map((p) => p.amount)), [points]);
  // Generous ceiling so bars are prominent, bold and not compressed
  const targetCeiling = useMemo(() => {
    if (maxAmount === 0) return Math.max(dailyAllowance, 50);
    return Math.max(maxAmount * 1.15, dailyAllowance * 1.05, 10);
  }, [dailyAllowance, maxAmount]);

  const targetPercent = Math.min(90, Math.max(15, Math.round((dailyAllowance / targetCeiling) * 100)));

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  const totalSpentAcrossPoints = useMemo(() => points.reduce((acc, p) => acc + p.amount, 0), [points]);
  const avgSpent = points.length > 0 ? totalSpentAcrossPoints / points.length : 0;
  const avgParts = formatMoneyParts(avgSpent, activeCurrency, intlLocale);
  const targetParts = formatMoneyParts(dailyAllowance, activeCurrency, intlLocale);
  const totalSpendParts = formatMoneyParts(totalSpend ?? totalSpentAcrossPoints, activeCurrency, intlLocale);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '175px',
      }}
    >
      {/* Telemetry row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.68rem',
          flexWrap: 'wrap',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span style={{ fontWeight: 700, letterSpacing: '0.04em', color: 'var(--color-text-main)' }}>{t('costs.expenses_by_day')}</span>
          {tripTotalDays !== undefined && (
            <>
              <span>·</span>
              <span>{t('costs.horizon_days', { days: tripTotalDays })}</span>
            </>
          )}
          {totalSpend !== undefined && (
            <>
              <span>·</span>
              <span>
                {(() => {
                  const [before, after] = t('costs.total_with_amount', { amount: '__AMT__' }).split('__AMT__');
                  return (
                    <>
                      {before}
                      <b style={{ color: 'var(--color-text-main)' }}>{totalSpendParts.integerPart}{totalSpendParts.otherPart}</b>
                      {after}
                    </>
                  );
                })()}
              </span>
            </>
          )}
        </div>

        {hoveredPoint ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {hoveredPoint.dayLabel}{hoveredPoint.dateLabel ? ` (${hoveredPoint.dateLabel})` : ''}:
            </span>
            <span
              style={{
                fontWeight: 700,
                color: hoveredPoint.isOverTarget ? 'var(--color-danger, #E63946)' : 'var(--color-text-main)',
              }}
            >
              {formatMoneyParts(hoveredPoint.amount, activeCurrency, intlLocale).integerPart}
              {formatMoneyParts(hoveredPoint.amount, activeCurrency, intlLocale).otherPart}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {hoveredPoint.expenseCount === 1
                ? t('costs.item_count_one', { count: 1 })
                : t('costs.item_count_other', { count: hoveredPoint.expenseCount })}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
            <span>{t('costs.avg_per_day', { amount: `${avgParts.integerPart}${avgParts.otherPart}` })}</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '2px', background: 'var(--color-accent-warning, #E2B33C)', display: 'inline-block' }} />
              {t('costs.target_per_day', { amount: `${targetParts.integerPart}${targetParts.otherPart}` })}
            </span>
          </div>
        )}
      </div>

      {/* Main Chart Section: Tall Bars + Target Guideline */}
      <div
        style={{
          position: 'relative',
          height: '115px',
          width: '100%',
        }}
      >
        {/* Target Allowance Dashed Guideline */}
        <div
          style={{
            position: 'absolute',
            bottom: `${targetPercent}%`,
            left: 0,
            right: 0,
            borderBottom: '1px dashed var(--color-accent-warning, #E2B33C)',
            opacity: 0.7,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <span
            style={{
              position: 'absolute',
              right: 0,
              bottom: '2px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.58rem',
              fontWeight: 600,
              color: 'var(--color-accent-warning, #E2B33C)',
              background: 'var(--color-surface-card)',
              padding: '0 4px',
              borderRadius: '3px',
            }}
          >
            {t('costs.target_paren', { amount: `${targetParts.integerPart}${targetParts.otherPart}` })}
          </span>
        </div>

        {/* Bars Container */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
          }}
        >
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx;
            const barHeightPct = targetCeiling > 0 ? Math.min(100, Math.round((p.amount / targetCeiling) * 100)) : 0;
            const money = formatMoneyParts(p.amount, activeCurrency, intlLocale);

            return (
              <div
                key={p.dateKey || `day-slot-${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  flex: 1,
                  minWidth: '28px',
                  maxWidth: '64px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                {/* Floating tooltip on active bar */}
                {isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 4px)',
                      background: 'var(--color-surface-card, #FFFFFF)',
                      border: '1px solid var(--color-border-subtle)',
                      boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.12))',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.62rem',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--color-text-main)' }}>
                      {money.integerPart}{money.otherPart}
                    </span>
                    <span style={{ color: p.isOverTarget ? 'var(--color-danger, #E63946)' : 'var(--color-text-muted)', fontSize: '0.58rem' }}>
                      {p.isOverTarget
                        ? t('costs.over_daily_target')
                        : p.amount > 0
                        ? t('costs.n_logged', { count: p.expenseCount })
                        : t('costs.zero_spent')}
                    </span>
                  </div>
                )}

                {/* Column Track */}
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '6px 6px 2px 2px',
                    background: isHovered
                      ? 'var(--color-surface-subtle, rgba(0, 0, 0, 0.08))'
                      : 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    overflow: 'hidden',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {p.amount > 0 ? (
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(12, barHeightPct)}%`,
                        background: p.isOverTarget
                          ? 'var(--color-danger, #E63946)'
                          : isHovered
                          ? 'var(--color-accent-teal-mid, #14788D)'
                          : 'var(--color-accent-primary, #0F4C5C)',
                        borderRadius: '5px 5px 0 0',
                        transition: 'height 0.3s ease, background 0.15s ease',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '60%',
                        height: '3px',
                        alignSelf: 'center',
                        background: 'var(--color-border-subtle, rgba(0, 0, 0, 0.12))',
                        borderRadius: '2px',
                        marginBottom: '1px',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dedicated X-Axis Labels Row - Cleanly separated below bars! */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          height: '22px',
          marginTop: '6px',
        }}
      >
        {points.map((p, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={p.dateKey || `day-label-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                flex: 1,
                minWidth: '28px',
                maxWidth: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.64rem',
                  color: p.isToday
                    ? 'var(--color-accent-primary, #0F4C5C)'
                    : isHovered
                    ? 'var(--color-text-main)'
                    : 'var(--color-text-muted)',
                  fontWeight: p.isToday || isHovered ? 700 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {points.length > 7 ? t('costs.day_short', { day: p.dayIndex }) : p.dayLabel}
              </span>
              {p.isToday && (
                <span
                  style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--color-accent-primary, #0F4C5C)',
                    display: 'inline-block',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DailyPaceDoubleCardProps {
  activeCurrency: string;
  destinationCity?: string;
  startDate?: string;
  endDate?: string;
  todaySpend: number;
  totalBudget: number;
  totalSpend: number;
  expenses?: DisplayExpenseItem[];
  onToggleMode?: (mode: 'pace' | 'fx') => void;
}

function DailyPaceDoubleCard({
  activeCurrency,
  destinationCity,
  startDate,
  endDate,
  todaySpend,
  totalBudget,
  totalSpend,
  expenses,
  onToggleMode,
}: DailyPaceDoubleCardProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const tripDuration = useMemo(() => {
    if (!startDate) {
      return { totalDays: 5, currentDay: 1, remainingDays: 5, statusText: t('costs.flexible_dates'), isPreTrip: false, isCompleted: false };
    }
    try {
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : start;
      const now = new Date();
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const totalDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 3600 * 24)) + 1);

      if (today < startDay) {
        const daysUntil = Math.max(1, Math.round((startDay.getTime() - today.getTime()) / (1000 * 3600 * 24)));
        return {
          totalDays,
          currentDay: 0,
          remainingDays: totalDays,
          statusText: t('costs.pretrip_starts_in', { days: daysUntil }),
          isPreTrip: true,
          isCompleted: false,
        };
      } else if (today > endDay) {
        return {
          totalDays,
          currentDay: totalDays,
          remainingDays: 0,
          statusText: t('costs.trip_completed_days', { days: totalDays }),
          isPreTrip: false,
          isCompleted: true,
        };
      } else {
        const currentDay = Math.min(totalDays, Math.max(1, Math.round((today.getTime() - startDay.getTime()) / (1000 * 3600 * 24)) + 1));
        const remainingDays = Math.max(1, totalDays - currentDay + 1);
        return {
          totalDays,
          currentDay,
          remainingDays,
          statusText: t('dashboard.day_progress', { current: currentDay, total: totalDays }),
          isPreTrip: false,
          isCompleted: false,
        };
      }
    } catch {
      return { totalDays: 5, currentDay: 1, remainingDays: 5, statusText: t('costs.trip_timeline'), isPreTrip: false, isCompleted: false };
    }
  }, [startDate, endDate, t]);

  const dailyAllowance = Math.max(1, totalBudget / tripDuration.totalDays);
  const remainingCushion = Math.max(0, totalBudget - totalSpend);

  const todayRatio = todaySpend / dailyAllowance;
  const isOverPacingToday = todayRatio > 1.05;

  const paceHealth = useMemo(() => {
    if (tripDuration.isCompleted) {
      return totalSpend <= totalBudget
        ? { text: t('costs.status_completed_on_budget'), color: 'var(--color-success, #1F7A4D)', bg: 'rgba(31, 122, 77, 0.12)' }
        : { text: t('costs.status_exceeded_budget'), color: 'var(--color-danger, #E63946)', bg: 'rgba(230, 57, 70, 0.12)' };
    }
    if (isOverPacingToday) {
      return { text: t('costs.status_over_pacing_today'), color: 'var(--color-accent-warning, #E2B33C)', bg: 'rgba(226, 179, 60, 0.18)' };
    }
    if (remainingCushion <= 0 && totalBudget > 0) {
      return { text: t('costs.status_budget_depleted'), color: 'var(--color-danger, #E63946)', bg: 'rgba(230, 57, 70, 0.12)' };
    }
    return { text: t('costs.status_on_track'), color: 'var(--color-success, #1F7A4D)', bg: 'rgba(31, 122, 77, 0.12)' };
  }, [tripDuration.isCompleted, isOverPacingToday, remainingCushion, totalBudget, totalSpend, t]);

  const dailySpendingData = useMemo<DailySpendingPoint[]>(() => {
    const points: DailySpendingPoint[] = [];
    const dateToExpenses: Record<string, { amount: number; count: number }> = {};

    if (Array.isArray(expenses) && expenses.length > 0) {
      expenses.forEach((item) => {
        const rawDate = item.date;
        const dateKey = rawDate ? rawDate.split('T')[0] : 'unassigned';
        const amt = typeof item.convertedAmount === 'number' ? item.convertedAmount : (Number(item.amount) || 0);
        if (!dateToExpenses[dateKey]) {
          dateToExpenses[dateKey] = { amount: 0, count: 0 };
        }
        dateToExpenses[dateKey].amount += amt;
        dateToExpenses[dateKey].count += 1;
      });
    }

    const todayIso = new Date().toISOString().split('T')[0];

    if (startDate) {
      try {
        const [sYear, sMonth, sDay] = startDate.split('T')[0].split('-').map(Number);
        const start = new Date(sYear, sMonth - 1, sDay);
        let end = start;
        if (endDate) {
          const [eYear, eMonth, eDay] = endDate.split('T')[0].split('-').map(Number);
          end = new Date(eYear, eMonth - 1, eDay);
        }
        const numDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

        const tripDatesSet = new Set<string>();
        for (let i = 0; i < numDays; i++) {
          const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          tripDatesSet.add(iso);

          const exp = dateToExpenses[iso];
          const amount = exp ? exp.amount : 0;
          const count = exp ? exp.count : 0;
          const dateLabel = d.toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' });

          points.push({
            dateKey: iso,
            dayIndex: i + 1,
            dayLabel: t('trips.day_label', { number: i + 1 }),
            dateLabel,
            amount,
            expenseCount: count,
            isToday: iso === todayIso,
            isOverTarget: amount > dailyAllowance,
          });
        }

        // Add any expense dates outside the trip horizon (e.g. pre-trip bookings)
        const outsideDates = Object.keys(dateToExpenses)
          .filter((k) => k !== 'unassigned' && !tripDatesSet.has(k))
          .sort();

        // Consolidate pre-trip & post-trip expenses cleanly
        let preTripAmount = 0;
        let preTripCount = 0;
        let postTripAmount = 0;
        let postTripCount = 0;

        outsideDates.forEach((iso) => {
          const parts = iso.split('-').map(Number);
          const d = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
          const exp = dateToExpenses[iso];
          if (d && d < start) {
            preTripAmount += exp.amount;
            preTripCount += exp.count;
          } else {
            postTripAmount += exp.amount;
            postTripCount += exp.count;
          }
        });

        if (preTripCount > 0) {
          points.unshift({
            dateKey: 'pre-trip',
            dayIndex: 0,
            dayLabel: t('costs.pretrip_label'),
            dateLabel: t('costs.bookings_label'),
            amount: preTripAmount,
            expenseCount: preTripCount,
            isToday: false,
            isOverTarget: preTripAmount > dailyAllowance,
          });
        }

        if (postTripCount > 0) {
          points.push({
            dateKey: 'post-trip',
            dayIndex: numDays + 1,
            dayLabel: t('costs.posttrip_label'),
            dateLabel: t('costs.after_trip_label'),
            amount: postTripAmount,
            expenseCount: postTripCount,
            isToday: false,
            isOverTarget: postTripAmount > dailyAllowance,
          });
        }

        if (dateToExpenses['unassigned']) {
          const exp = dateToExpenses['unassigned'];
          points.push({
            dateKey: 'unassigned',
            dayIndex: points.length + 1,
            dayLabel: t('costs.categories.other'),
            dateLabel: t('costs.no_date_label'),
            amount: exp.amount,
            expenseCount: exp.count,
            isToday: false,
            isOverTarget: exp.amount > dailyAllowance,
          });
        }

        return points;
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback: If no valid startDate
    const sortedDates = Object.keys(dateToExpenses).sort();
    if (sortedDates.length > 0) {
      return sortedDates.map((k, idx) => {
        const exp = dateToExpenses[k];
        return {
          dateKey: k,
          dayIndex: idx + 1,
          dayLabel: k === 'unassigned' ? t('costs.categories.other') : t('trips.day_label', { number: idx + 1 }),
          dateLabel: k === 'unassigned' ? t('costs.no_date_label') : k,
          amount: exp.amount,
          expenseCount: exp.count,
          isToday: k === todayIso,
          isOverTarget: exp.amount > dailyAllowance,
        };
      });
    }

    // Default 5 empty day slots if completely empty
    const daysCount = tripDuration.totalDays || 5;
    for (let i = 0; i < daysCount; i++) {
      points.push({
        dateKey: `day-slot-${i + 1}`,
        dayIndex: i + 1,
        dayLabel: t('trips.day_label', { number: i + 1 }),
        dateLabel: '',
        amount: 0,
        expenseCount: 0,
        isToday: false,
        isOverTarget: false,
      });
    }
    return points;
  }, [expenses, startDate, endDate, dailyAllowance, tripDuration.totalDays, intlLocale, t]);

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
        minHeight: '220px',
      }}
    >
      <div>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
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
                <path d="m12 14 4-4" />
                <path d="M3.34 19a10 10 0 1 1 17.32 0" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-display, "Jost", sans-serif)', fontSize: '0.92rem', fontWeight: 600 }}>
                {t('costs.daily_pace_title')}
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                {tripDuration.statusText}{destinationCity ? ` · ${destinationCity}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onToggleMode && <ModeToggle mode="pace" onChange={onToggleMode} />}
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '20px',
                background: paceHealth.bg,
                color: paceHealth.color,
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
                  background: paceHealth.color,
                }}
              />
              {paceHealth.text}
            </span>
          </div>
        </div>
      </div>

      {/* Main Body: ONLY the Daily Expenses Graph! */}
      <div style={{ marginTop: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <DailyExpensesGraph
          points={dailySpendingData}
          dailyAllowance={dailyAllowance}
          activeCurrency={activeCurrency}
          tripTotalDays={tripDuration.totalDays}
          totalSpend={totalSpend}
        />
      </div>
    </div>
  );
}

function CurrencyConverterDoubleCard({
  activeCurrency,
  destinationCurrency,
  destinationCountryCode,
  destinationCountryName,
  exchangeRate,
  isLiveRate,
  onOpenWheelPicker,
  onToggleMode,
}: {
  activeCurrency: string;
  destinationCurrency: string;
  destinationCountryCode?: string;
  destinationCountryName?: string;
  exchangeRate: number;
  isLiveRate: boolean;
  onOpenWheelPicker?: () => void;
  onToggleMode?: (mode: 'pace' | 'fx') => void;
}) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const [testAmount, setTestAmount] = useState<string>('100');
  const numAmount = parseFloat(testAmount) || 0;
  const convertedAmount = numAmount * exchangeRate;

  const activeInfo = getCurrencyInfo(activeCurrency);
  const destInfo = getCurrencyInfo(destinationCurrency);
  const displayDestCountryCode = destinationCountryCode || destInfo.countryCode;
  const displayDestCountry = getLocalizedCurrencyCountry(
    displayDestCountryCode,
    destinationCountryName || destInfo.country,
    locale
  );
  const displayActiveCountry = getLocalizedCurrencyCountry(
    activeInfo.countryCode,
    activeInfo.country,
    locale
  );

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
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
                {t('costs.live_fx_title')}
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{displayActiveCountry}</span>
                <ArrowRightIcon size={10} color="var(--color-text-muted)" />
                <span>{displayDestCountry}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onToggleMode && <ModeToggle mode="fx" onChange={onToggleMode} />}
            {isLiveRate && (
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '20px',
                  background: 'rgba(31, 122, 77, 0.12)',
                  color: 'var(--color-success, #1F7A4D)',
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
                    background: 'var(--color-success, #1F7A4D)',
                  }}
                />
                {t('costs.live_ecb')}
              </span>
            )}
          </div>
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
              {t('costs.select_active_currency')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                data-testid="costs-currency-dial-btn"
                onClick={onOpenWheelPicker}
                title={t('costs.spin_currency_dial_title')}
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

              <span style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                <ArrowRightIcon size={12} color="var(--color-text-muted)" />
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
              {t('costs.live_conversion')}
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
                  aria-label={t('costs.currency_amount_aria')}
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
                {convertedAmount.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          {t('costs.live_rate_pair', {
            from: activeCurrency,
            rate: exchangeRate.toFixed(4),
            to: destinationCurrency,
          })}
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
  destinationCity?: string;
  exchangeRate?: number;
  isLiveRate?: boolean;
  onOpenCurrencyPicker?: () => void;
  startDate?: string;
  endDate?: string;
  todaySpend?: number;
  totalBudget?: number;
  expenses?: DisplayExpenseItem[];
  isSingleTraveler?: boolean;
}

export function CostsSummaryCards({
  totals,
  activeCurrency = 'EUR',
  destinationCurrency = 'EUR',
  destinationCountryCode,
  destinationCountryName,
  destinationCity,
  exchangeRate = 1.0,
  isLiveRate = true,
  onOpenCurrencyPicker,
  startDate,
  endDate,
  todaySpend,
  totalBudget,
  expenses,
  isSingleTraveler = false,
}: CostsSummaryCardsProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const currency = totals.currency || activeCurrency || 'EUR';

  const isSameCurrency = (activeCurrency || '').toUpperCase() === (destinationCurrency || '').toUpperCase();
  const [userSelectedMode, setUserSelectedMode] = useState<'pace' | 'fx' | null>(null);
  const [prevCurrencyKey, setPrevCurrencyKey] = useState(`${activeCurrency}-${destinationCurrency}`);

  const currentCurrencyKey = `${activeCurrency}-${destinationCurrency}`;
  if (currentCurrencyKey !== prevCurrencyKey) {
    setPrevCurrencyKey(currentCurrencyKey);
    setUserSelectedMode(null);
  }

  // If the default/active currency is the same as destination currency,
  // completely remove the exchange option and always display Daily Spending Pace.
  const cardMode = isSameCurrency ? 'pace' : (userSelectedMode ?? 'fx');

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

      {/* 1. Double Card: Daily Spending Pace (when same currency) or Dual-Mode Smart Card */}
      {cardMode === 'pace' ? (
        <DailyPaceDoubleCard
          activeCurrency={currency}
          destinationCity={destinationCity}
          startDate={startDate}
          endDate={endDate}
          todaySpend={todaySpend ?? 0}
          totalBudget={totalBudget ?? (totals.totalSpend > 0 ? totals.totalSpend * 1.25 : 600)}
          totalSpend={totals.totalSpend}
          expenses={expenses}
          onToggleMode={isSameCurrency ? undefined : (m) => setUserSelectedMode(m)}
        />
      ) : (
        <CurrencyConverterDoubleCard
          activeCurrency={activeCurrency}
          destinationCurrency={destinationCurrency}
          destinationCountryCode={destinationCountryCode}
          destinationCountryName={destinationCountryName}
          exchangeRate={exchangeRate}
          isLiveRate={isLiveRate}
          onOpenWheelPicker={onOpenCurrencyPicker}
          onToggleMode={(m) => setUserSelectedMode(m)}
        />
      )}

      {/* 2. Single Card (Original Size): Solo Payment Status or Merged Debt / Settlement Card */}
      {isSingleTraveler ? (
        (totals.outstandingCount ?? 0) > 0 ? (
          <SummaryCard
            label={t('costs.pending_costs')}
            sub={t('costs.unpaid_route_estimates')}
            amount={totals.outstanding ?? 0}
            currency={currency}
            tone="neutral"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            foot={
              <span style={{ color: 'var(--color-accent-secondary)', fontWeight: 600 }}>
                {totals.outstandingCount === 1
                  ? t('costs.items_unpaid_one', { count: 1 })
                  : t('costs.items_unpaid_other', { count: totals.outstandingCount ?? 0 })}
              </span>
            }
          />
        ) : (
          <SummaryCard
            label={t('costs.all_costs_paid')}
            sub={t('costs.no_unpaid_estimates')}
            amount={0}
            currency={currency}
            tone="owed"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            foot={
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                {t('costs.all_planned_expenses_paid')}
              </span>
            }
          />
        )
      ) : hasOwe && hasOwed ? (
        // State 4: Both owing and owed -> Split into two dedicated halves
        <SplitDebtCard owe={totals.owe} owed={totals.owed} currency={currency} />
      ) : hasOwe ? (
        // State 2: Only owing -> Use existing "You owe" style
        <SummaryCard
          label={t('costs.you_owe')}
          sub={t('costs.you_should_pay_others')}
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
              {t('costs.payments_pending')}
            </span>
          }
        />
      ) : hasOwed ? (
        // State 1: Only owed -> Use existing "You're owed" style
        <SummaryCard
          label={t('costs.youre_owed')}
          sub={t('costs.others_should_pay_you')}
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
              {t('costs.refunds_pending')}
            </span>
          }
        />
      ) : (
        // State 3: Neutral -> All settled up
        <SummaryCard
          label={t('costs.all_settled_up')}
          sub={t('costs.balance_neutral')}
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
              {t('costs.nothing_owed_or_owing')}
            </span>
          }
        />
      )}

      {/* 3. Single Card (Original Size): Total Trip Spend */}
      <SummaryCard
        label={t('costs.total_trip_spend')}
        sub={isSingleTraveler ? t('costs.solo_trip_expenses') : t('costs.across_all_travelers')}
        amount={totals.totalSpend}
        targetAmount={totalBudget}
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
          isSingleTraveler ? (
            <div style={{ display: 'flex', gap: '14px', width: '100%', flexWrap: 'wrap' }}>
              <span>
                {(() => {
                  const [before, after] = t('costs.paid_with_amount', { amount: '__AMT__' }).split('__AMT__');
                  const p = formatMoneyParts(totals.totalSpend, currency, intlLocale);
                  return (
                    <>
                      {before}
                      <b style={{ color: 'var(--color-text-on-accent)' }}>
                        {p.integerPart}
                        {p.otherPart}
                      </b>
                      {after}
                    </>
                  );
                })()}
              </span>
              <span>·</span>
              <span>
                {(() => {
                  const [before, after] = t('costs.unpaid_with_amount', { amount: '__AMT__' }).split('__AMT__');
                  const p = formatMoneyParts(totals.outstanding ?? 0, currency, intlLocale);
                  return (
                    <>
                      {before}
                      <b style={{ color: 'var(--color-text-on-accent)' }}>
                        {p.integerPart}
                        {p.otherPart}
                      </b>
                      {after}
                    </>
                  );
                })()}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '14px', width: '100%', flexWrap: 'wrap' }}>
              <span>
                {(() => {
                  const [before, after] = t('costs.your_share_with_amount', { amount: '__AMT__' }).split('__AMT__');
                  const p = formatMoneyParts(totals.myShare, currency, intlLocale);
                  return (
                    <>
                      {before}
                      <b style={{ color: 'var(--color-text-on-accent)' }}>
                        {p.integerPart}
                        {p.otherPart}
                      </b>
                      {after}
                    </>
                  );
                })()}
              </span>
              <span>·</span>
              <span>
                {(() => {
                  const [before, after] = t('costs.you_paid_with_amount', { amount: '__AMT__' }).split('__AMT__');
                  const p = formatMoneyParts(totals.myPaid, currency, intlLocale);
                  return (
                    <>
                      {before}
                      <b style={{ color: 'var(--color-text-on-accent)' }}>
                        {p.integerPart}
                        {p.otherPart}
                      </b>
                      {after}
                    </>
                  );
                })()}
              </span>
            </div>
          )
        }
      />
    </div>
  );
}
