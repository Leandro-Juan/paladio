"use client";

import React from 'react';
import { getCostCategoryMeta } from './costsCategories';

export interface DisplayExpenseItem {
  id: string;
  source: 'logged' | 'itinerary';
  title: string;
  category: string;
  amount: number;
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
  onEdit?: (item: DisplayExpenseItem) => void;
  onDelete?: (item: DisplayExpenseItem) => void;
  onClaim?: (item: DisplayExpenseItem) => void;
}

export function ExpenseRow({ item, onEdit, onDelete, onClaim }: ExpenseRowProps) {
  const meta = getCostCategoryMeta(item.category);
  const Icon = meta.icon;
  const isUnfinished = item.isUnfinished || !item.payerId || item.source === 'itinerary';
  const currency = item.currency || 'EUR';

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '16px',
        padding: '20px 20px 16px 20px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Signature corner-riding category badge */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-1px',
          top: '-1px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 10px 4px 9px',
          borderRadius: '15px 0 10px 0',
          background: meta.color,
          color: '#FFFFFF',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.2,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Icon size={10} />
        {meta.label}
      </span>

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

            {isUnfinished && (
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
                Unfinished
              </span>
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
            {item.payerName ? (
              <span>
                Paid by <b style={{ color: 'var(--color-text-main)' }}>{item.payerName}</b>
              </span>
            ) : (
              <span style={{ color: 'var(--color-accent-secondary)' }}>
                {item.source === 'itinerary' ? '// ROUTE ESTIMATE (UNASSIGNED)' : '// NEEDS A PAYER'}
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
            €{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.68rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {currency}
          </div>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isUnfinished && onClaim && (
            <button
              type="button"
              onClick={() => onClaim(item)}
              title="Assign Payer"
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
              Assign
            </button>
          )}

          {onEdit && item.source === 'logged' && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              title="Edit Expense"
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
              title="Delete Expense"
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
