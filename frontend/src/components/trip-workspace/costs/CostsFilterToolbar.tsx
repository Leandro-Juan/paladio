"use client";

import React from 'react';
import { COST_CATEGORY_LIST } from './costsCategories';

export type FilterScope = 'all' | 'mine' | 'owed';

interface CostsFilterToolbarProps {
  totalCount: number;
  search: string;
  onSearchChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
  dayFilter: string;
  onDayFilterChange: (val: string) => void;
  days: Array<{ value: string; label: string }>;
  scopeFilter: FilterScope;
  onScopeFilterChange: (scope: FilterScope) => void;
  onExportCsv?: () => void;
}

export function CostsFilterToolbar({
  totalCount,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  dayFilter,
  onDayFilterChange,
  days,
  scopeFilter,
  onScopeFilterChange,
  onExportCsv,
}: CostsFilterToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display, "Jost", sans-serif)',
            fontSize: '1.4rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--color-text-main)',
          }}
        >
          Expenses
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.8rem',
            color: 'var(--color-text-muted)',
            fontWeight: 500,
          }}
        >
          ({totalCount})
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            padding: '0 10px',
            height: '36px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '0.82rem',
              width: '130px',
              color: 'var(--color-text-main)',
            }}
          />
        </div>

        {/* Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
          style={{
            height: '36px',
            padding: '0 10px',
            borderRadius: '10px',
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-surface-card)',
            fontFamily: 'var(--font-body, "Inter", sans-serif)',
            fontSize: '0.82rem',
            color: 'var(--color-text-main)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">All categories</option>
          {COST_CATEGORY_LIST.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>

        {/* Day Dropdown */}
        {days.length > 0 && (
          <select
            value={dayFilter}
            onChange={(e) => onDayFilterChange(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '10px',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '0.82rem',
              color: 'var(--color-text-main)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All days</option>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        )}

        {/* Segmented Filter Pills */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            padding: '3px',
            gap: '2px',
          }}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'mine', label: 'Paid by me' },
              { key: 'owed', label: "I'm owed" },
            ] as const
          ).map((item) => {
            const active = scopeFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onScopeFilterChange(item.key)}
                style={{
                  border: 'none',
                  background: active ? 'var(--color-accent-primary)' : 'transparent',
                  color: active ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)',
                  fontWeight: active ? 700 : 500,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  padding: '5px 10px',
                  borderRadius: '7px',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Export CSV Button */}
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            title="Export CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-main)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
