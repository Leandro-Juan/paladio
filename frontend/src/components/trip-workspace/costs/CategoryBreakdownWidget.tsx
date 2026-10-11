"use client";

import React, { useMemo } from 'react';
import { COST_CATEGORY_LIST, getCostCategoryMeta } from './costsCategories';
import { DisplayExpenseItem } from './ExpenseRow';

interface CategoryBreakdownWidgetProps {
  items: DisplayExpenseItem[];
  currency?: string;
}

export function CategoryBreakdownWidget({ items, currency = 'EUR' }: CategoryBreakdownWidgetProps) {
  const currencySymbol = currency === 'EUR' ? '€' : `${currency} `;

  // Aggregate total spent per category
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of items) {
      const meta = getCostCategoryMeta(item.category);
      totals[meta.key] = (totals[meta.key] || 0) + (item.amount || 0);
    }

    return COST_CATEGORY_LIST.map((c) => ({
      ...c,
      total: totals[c.key] || 0,
    }))
      .filter((c) => c.total > 0.001)
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const maxCategoryAmount = useMemo(() => {
    return Math.max(0, ...categoryTotals.map((c) => c.total));
  }, [categoryTotals]);

  const grandTotal = useMemo(() => {
    return categoryTotals.reduce((sum, c) => sum + c.total, 0);
  }, [categoryTotals]);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--color-border, #E2E8F0)',
        borderRadius: '16px',
        padding: '22px 24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display, "Outfit", sans-serif)',
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary, #0F172A)',
          }}
        >
          BY CATEGORY
        </div>

        {grandTotal > 0 && (
          <div
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--color-text-muted, #64748B)',
            }}
          >
            Total: <b style={{ color: 'var(--color-text-primary, #0F172A)' }}>{currencySymbol}{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</b>
          </div>
        )}
      </div>

      {categoryTotals.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted, #94A3B8)',
          }}
        >
          {`// NO CATEGORY COSTS LOGGED YET`}
        </div>
      ) : (
        <div>
          {/* Top Multi-Segment Distribution Bar */}
          <div
            style={{
              display: 'flex',
              height: '8px',
              borderRadius: '4px',
              overflow: 'hidden',
              background: '#F1F5F9',
              marginBottom: '18px',
              gap: '2px',
            }}
            title="Overall Category Allocation"
          >
            {categoryTotals.map((cat) => {
              const segPct = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
              return (
                <div
                  key={cat.key}
                  style={{
                    width: `${segPct}%`,
                    background: cat.color,
                    height: '100%',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${cat.label}: ${segPct.toFixed(1)}%`}
                />
              );
            })}
          </div>

          {/* Individual Category Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {categoryTotals.map((cat) => {
              const percentage =
                maxCategoryAmount > 0 ? (cat.total / maxCategoryAmount) * 100 : 0;
              const shareOfTotal =
                grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(0) : '0';

              return (
                <div
                  key={cat.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '6px 10px',
                    alignItems: 'center',
                  }}
                >
                  {/* Category color dot */}
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '3px',
                      background: cat.color,
                    }}
                  />

                  {/* Category label */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-body, "Inter", sans-serif)',
                        fontSize: '0.86rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary, #0F172A)',
                      }}
                    >
                      {cat.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted, #94A3B8)',
                      }}
                    >
                      {shareOfTotal}%
                    </span>
                  </div>

                  {/* Amount right-aligned */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary, #0F172A)',
                    }}
                  >
                    {currencySymbol}{cat.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>

                  {/* Horizontal bar */}
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      height: '5px',
                      borderRadius: '3px',
                      background: '#F1F5F9',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(2, percentage))}%`,
                        background: cat.color,
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
