"use client";

import React from 'react';
import { getCostCategoryMeta } from './costsCategories';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { useTranslation } from '@/hooks/useTranslation';

export interface DisplayExpenseItem {
  id: string;
  source: 'logged' | 'itinerary';
  title: string;
  category: string;
  amount: number;
  convertedAmount?: number;
  currency?: string;
  date?: string;
  payerId?: string;
  payerName?: string;
  isUnfinished?: boolean;
  splitSummary?: string;
  raw?: unknown;
}

interface ExpenseRowProps {
  item: DisplayExpenseItem;
  activeCurrency?: string;
  isSingleTraveler?: boolean;
  onEdit?: (item: DisplayExpenseItem) => void;
  onDelete?: (item: DisplayExpenseItem) => void;
  onClaim?: (item: DisplayExpenseItem) => void;
  onMarkPaid?: (item: DisplayExpenseItem) => void;
  onMarkUnpaid?: (item: DisplayExpenseItem) => void;
}

export function ExpenseRow({
  item,
  activeCurrency,
  isSingleTraveler = false,
  onEdit,
  onDelete,
  onClaim,
  onMarkPaid,
  onMarkUnpaid,
}: ExpenseRowProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const meta = getCostCategoryMeta(item.category);
  const Icon = meta.icon;
  const isUnfinished = item.isUnfinished || !item.payerId || item.source === 'itinerary';
  const currency = item.currency || 'EUR';
  const viewCurrency = activeCurrency || 'EUR';
  const activeCurInfo = getCurrencyInfo(viewCurrency);
  const origCurInfo = getCurrencyInfo(currency);
  const displayAmount = typeof item.convertedAmount === 'number' ? item.convertedAmount : item.amount;
  const isDifferentCurrency = currency.toUpperCase() !== viewCurrency.toUpperCase();

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '16px',
        padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Left side: Icon + Title/Details */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
        <span
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            background: meta.bgLight,
            border: `1px solid ${meta.borderColor}`,
            color: meta.color,
            flexShrink: 0,
          }}
        >
          <Icon size={20} />
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--color-text-main)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </span>

            {isSingleTraveler ? (
              isUnfinished ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '1px 7px',
                    borderRadius: '6px',
                    background: 'rgba(226, 179, 60, 0.12)',
                    border: '1px solid rgba(226, 179, 60, 0.3)',
                    color: 'var(--color-accent-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('costs.status_unpaid')}
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '1px 7px',
                    borderRadius: '6px',
                    background: 'rgba(5, 150, 105, 0.12)',
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    color: 'var(--color-success)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('costs.status_paid')}
                </span>
              )
            ) : (
              isUnfinished && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '1px 7px',
                    borderRadius: '6px',
                    background: 'rgba(226, 179, 60, 0.12)',
                    border: '1px solid rgba(226, 179, 60, 0.3)',
                    color: 'var(--color-accent-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('costs.status_unfinished')}
                </span>
              )
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.73rem',
              color: 'var(--color-text-muted)',
              marginTop: '4px',
              flexWrap: 'wrap',
            }}
          >
            {isSingleTraveler ? (
              !isUnfinished ? (
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{t('costs.status_paid')}</span>
              ) : (
                <span style={{ color: 'var(--color-accent-secondary)' }}>
                  {item.source === 'itinerary' ? t('costs.route_estimate') : t('costs.status_unpaid_upper')}
                </span>
              )
            ) : item.payerName ? (
              (() => {
                const [before, after] = t('costs.paid_by_name', { name: '__PAYER__' }).split('__PAYER__');
                return (
                  <span>
                    {before}
                    <b style={{ color: 'var(--color-text-main)' }}>{item.payerName}</b>
                    {after}
                  </span>
                );
              })()
            ) : (
              <span style={{ color: 'var(--color-accent-secondary)' }}>
                {item.source === 'itinerary' ? t('costs.route_estimate_unassigned') : t('costs.needs_payer')}
              </span>
            )}

            {item.splitSummary && (
              <>
                <span>·</span>
                <span>{item.splitSummary}</span>
              </>
            )}

            {item.date && (
              <>
                <span>·</span>
                <span>{item.date}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Amount + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontFeatureSettings: '"tnum"',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-text-main)',
              letterSpacing: '-0.02em',
            }}
          >
            {activeCurInfo.symbol}{displayAmount.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.68rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {isDifferentCurrency
              ? t('costs.paid_original_currency', {
                  amount: `${origCurInfo.symbol}${item.amount.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
                })
              : viewCurrency}
          </div>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isSingleTraveler ? (
            <>
              {isUnfinished && (onMarkPaid || onClaim) && (
                <button
                  type="button"
                  onClick={() => (onMarkPaid ? onMarkPaid(item) : onClaim?.(item))}
                  title={t('costs.mark_as_paid_title')}
                  style={{
                    border: '1px solid var(--color-accent-primary)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-accent-primary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    borderRadius: '8px',
                    padding: '5px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('costs.mark_paid')}
                </button>
              )}

              {!isUnfinished && onMarkUnpaid && (
                <button
                  type="button"
                  onClick={() => onMarkUnpaid(item)}
                  title={t('costs.mark_as_unpaid_title')}
                  style={{
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('costs.mark_unpaid')}
                </button>
              )}
            </>
          ) : (
            isUnfinished &&
            onClaim && (
              <button
                type="button"
                onClick={() => onClaim(item)}
                title={t('costs.assign_payer_title')}
                style={{
                  border: '1px solid var(--color-accent-primary)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-accent-primary)',
                  fontFamily: 'var(--font-mono, monospace)',
                  borderRadius: '8px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t('costs.assign_btn')}
              </button>
            )
          )}

          {onEdit && (isSingleTraveler || item.source === 'logged') && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              title={t('costs.edit_expense')}
              style={{
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}

          {onDelete && item.source === 'logged' && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              title={t('costs.delete_expense')}
              style={{
                border: '1px solid var(--color-danger)',
                background: 'transparent',
                color: 'var(--color-danger)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
