"use client";

import React, { useMemo, useState } from 'react';
import { COST_CATEGORY_LIST, getCostCategoryMeta } from './costsCategories';
import { DisplayExpenseItem } from './ExpenseRow';
import { getCurrencyInfo } from '@/utils/currencyResolver';

interface CategoryBreakdownWidgetProps {
  items: DisplayExpenseItem[];
  currency?: string;
}

/**
 * Generates an SVG path data string for a donut arc segment.
 * Angle convention: 0 is at 3 o'clock; angles increase clockwise.
 */
function describeDonutArc(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
): string {
  const x1Outer = cx + rOuter * Math.cos(startAngle);
  const y1Outer = cy + rOuter * Math.sin(startAngle);
  const x2Outer = cx + rOuter * Math.cos(endAngle);
  const y2Outer = cy + rOuter * Math.sin(endAngle);

  const x2Inner = cx + rInner * Math.cos(endAngle);
  const y2Inner = cy + rInner * Math.sin(endAngle);
  const x1Inner = cx + rInner * Math.cos(startAngle);
  const y1Inner = cy + rInner * Math.sin(startAngle);

  const span = endAngle - startAngle;
  const largeArcFlag = span > Math.PI ? 1 : 0;

  return `M ${x1Outer.toFixed(2)} ${y1Outer.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Outer.toFixed(2)} ${y2Outer.toFixed(2)} L ${x2Inner.toFixed(2)} ${y2Inner.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x1Inner.toFixed(2)} ${y1Inner.toFixed(2)} Z`;
}

export function CategoryBreakdownWidget({ items, currency = 'EUR' }: CategoryBreakdownWidgetProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const currencyInfo = getCurrencyInfo(currency);
  const currencySymbol = currencyInfo.symbol;

  // Aggregate total spent per category
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of items) {
      const meta = getCostCategoryMeta(item.category);
      const amt = typeof item.convertedAmount === 'number' ? item.convertedAmount : item.amount;
      totals[meta.key] = (totals[meta.key] || 0) + (amt || 0);
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

  const activeCategory = useMemo(() => {
    return categoryTotals.find((c) => c.key === hoveredKey) || null;
  }, [categoryTotals, hoveredKey]);

  const formatCost = (amt: number) => {
    return amt.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Compute circular slices geometry
  const slices = useMemo(() => {
    if (grandTotal <= 0 || categoryTotals.length === 0) return [];

    if (categoryTotals.length === 1) {
      const cat = categoryTotals[0];
      return [
        {
          key: cat.key,
          label: cat.label,
          color: cat.color,
          total: cat.total,
          sharePct: 100,
          isSingle: true,
          startAngle: 0,
          endAngle: 0,
        },
      ];
    }

    const gap = 0.035; // ~2 degrees angular gap for sleek distinction
    let curAngle = -Math.PI / 2; // Start from 12 o'clock

    return categoryTotals.map((cat) => {
      const share = cat.total / grandTotal;
      const sharePct = Math.round(share * 100);
      const sliceAngle = share * 2 * Math.PI;

      // Apply gap only when slice is larger than 1.5 * gap
      const effGap = sliceAngle > gap * 1.5 ? gap : 0;
      const startAngle = curAngle + effGap / 2;
      const endAngle = curAngle + sliceAngle - effGap / 2;
      curAngle += sliceAngle;

      return {
        key: cat.key,
        label: cat.label,
        color: cat.color,
        total: cat.total,
        sharePct,
        isSingle: false,
        startAngle,
        endAngle,
      };
    });
  }, [categoryTotals, grandTotal]);

  return (
    <div
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg, 16px)',
        padding: '22px 24px',
        boxShadow: 'var(--shadow-sm)',
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
            Total: <b style={{ color: 'var(--color-text-primary, #0F172A)' }}>{currencySymbol}{formatCost(grandTotal)}</b>
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
          {/* Circular Donut Graph */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '6px 0 16px 0',
            }}
          >
            <svg
              width="170"
              height="170"
              viewBox="0 0 180 180"
              style={{ overflow: 'visible', userSelect: 'none' }}
              aria-label="Category cost distribution circular graph"
              role="img"
            >
              {slices.map((slice) => {
                const isHovered = hoveredKey === slice.key;
                const rOuter = isHovered ? 76 : 72;
                const rInner = isHovered ? 45 : 48;
                const tooltipText = `${slice.label}: ${currencySymbol}${formatCost(slice.total)} (${slice.sharePct}%)`;

                if (slice.isSingle) {
                  return (
                    <circle
                      key={slice.key}
                      cx={90}
                      cy={90}
                      r={(rOuter + rInner) / 2}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={rOuter - rInner}
                      style={{
                        cursor: 'pointer',
                        transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredKey(slice.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={tooltipText}
                    >
                      <title>{tooltipText}</title>
                    </circle>
                  );
                }

                const d = describeDonutArc(90, 90, rInner, rOuter, slice.startAngle, slice.endAngle);

                return (
                  <path
                    key={slice.key}
                    d={d}
                    fill={slice.color}
                    style={{
                      cursor: 'pointer',
                      transition: 'd 0.2s ease, opacity 0.2s ease, filter 0.2s ease',
                      opacity: hoveredKey && !isHovered ? 0.4 : 1,
                      filter: isHovered ? 'drop-shadow(0px 2px 4px rgba(0,0,0,0.15))' : 'none',
                    }}
                    onMouseEnter={() => setHoveredKey(slice.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    tabIndex={0}
                    role="graphics-symbol"
                    aria-label={tooltipText}
                  >
                    <title>{tooltipText}</title>
                  </path>
                );
              })}

              {/* Center Info in Donut Hole */}
              <g pointerEvents="none">
                {activeCategory ? (
                  <>
                    <text
                      x={90}
                      y={78}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-display, "Outfit", sans-serif)',
                        fontSize: '11px',
                        fontWeight: 700,
                        fill: activeCategory.color,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {activeCategory.label.length > 13
                        ? `${activeCategory.label.slice(0, 12)}…`
                        : activeCategory.label}
                    </text>
                    <text
                      x={90}
                      y={97}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '13px',
                        fontWeight: 700,
                        fill: 'var(--color-text-primary, #0F172A)',
                      }}
                    >
                      {currencySymbol}{formatCost(activeCategory.total)}
                    </text>
                    <text
                      x={90}
                      y={112}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '10px',
                        fontWeight: 600,
                        fill: 'var(--color-text-muted, #64748B)',
                      }}
                    >
                      {grandTotal > 0 ? ((activeCategory.total / grandTotal) * 100).toFixed(0) : '0'}%
                    </text>
                  </>
                ) : (
                  <>
                    <text
                      x={90}
                      y={78}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-display, "Outfit", sans-serif)',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fill: 'var(--color-text-muted, #64748B)',
                      }}
                    >
                      TOTAL
                    </text>
                    <text
                      x={90}
                      y={97}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '13px',
                        fontWeight: 700,
                        fill: 'var(--color-text-primary, #0F172A)',
                      }}
                    >
                      {currencySymbol}{formatCost(grandTotal)}
                    </text>
                    <text
                      x={90}
                      y={112}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '10px',
                        fill: 'var(--color-text-muted, #94A3B8)',
                      }}
                    >
                      {categoryTotals.length} {categoryTotals.length === 1 ? 'category' : 'categories'}
                    </text>
                  </>
                )}
              </g>
            </svg>
          </div>

          {/* Individual Category Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {categoryTotals.map((cat) => {
              const percentage =
                maxCategoryAmount > 0 ? (cat.total / maxCategoryAmount) * 100 : 0;
              const shareOfTotal =
                grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(0) : '0';
              const isHovered = hoveredKey === cat.key;
              const tooltipText = `${cat.label}: ${currencySymbol}${formatCost(cat.total)} (${shareOfTotal}%)`;

              return (
                <div
                  key={cat.key}
                  title={tooltipText}
                  onMouseEnter={() => setHoveredKey(cat.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '6px 10px',
                    alignItems: 'center',
                    padding: '4px 6px',
                    margin: '0 -6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isHovered
                      ? 'var(--color-surface-hover, rgba(148, 163, 184, 0.1))'
                      : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {/* Category color dot */}
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '3px',
                      background: cat.color,
                      transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.15s ease',
                    }}
                  />

                  {/* Category label */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-body, "Inter", sans-serif)',
                        fontSize: '0.86rem',
                        fontWeight: isHovered ? 700 : 600,
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
                    {currencySymbol}{formatCost(cat.total)}
                  </span>

                  {/* Horizontal bar */}
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      height: '5px',
                      borderRadius: '3px',
                      background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.15))',
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
