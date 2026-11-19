"use client";

import React from 'react';
import { COST_CATEGORY_LIST } from './costsCategories';
import { CustomSelect } from '../wallet/parts/CustomSelect';
import { useTranslation } from '@/hooks/useTranslation';

export type FilterScope = 'all' | 'mine' | 'owed' | 'paid' | 'unpaid';

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
  isSingleTraveler?: boolean;
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
  isSingleTraveler = false,
  onExportCsv,
}: CostsFilterToolbarProps) {
  const { t } = useTranslation();
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
          {t('costs.expenses_heading')}
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
            placeholder={t('costs.search_expenses_placeholder')}
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
        <CustomSelect
          value={categoryFilter}
          onChange={onCategoryFilterChange}
          label={t('costs.filter_by_category')}
          options={[
            { value: '', label: t('costs.all_categories') },
            ...COST_CATEGORY_LIST.map((cat) => ({ value: cat.key, label: t(cat.labelKey) })),
          ]}
          style={{
            width: 'auto',
            minWidth: '140px',
            fontFamily: 'var(--font-body, "Inter", sans-serif)',
          }}
          buttonStyle={{
            height: '36px',
            padding: '0 10px',
            borderRadius: '10px',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '0.82rem',
            color: 'var(--color-text-main)',
          }}
        />

        {/* Day Dropdown */}
        {days.length > 0 && (
          <CustomSelect
            value={dayFilter}
            onChange={onDayFilterChange}
            label={t('costs.filter_by_day')}
            options={[
              { value: '', label: t('costs.all_days') },
              ...days.map((d) => ({ value: d.value, label: d.label })),
            ]}
            style={{
              width: 'auto',
              minWidth: '112px',
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
            }}
            buttonStyle={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '10px',
              border: '1px solid var(--color-border-subtle)',
              fontSize: '0.82rem',
              color: 'var(--color-text-main)',
            }}
          />
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
          {(isSingleTraveler
            ? ([
                { key: 'all', label: t('costs.filter_all') },
                { key: 'paid', label: t('costs.status_paid') },
                { key: 'unpaid', label: t('costs.status_unpaid') },
              ] as const)
            : ([
                { key: 'all', label: t('costs.filter_all') },
                { key: 'mine', label: t('costs.filter_paid_by_me') },
                { key: 'owed', label: t('costs.filter_im_owed') },
              ] as const)
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
            title={t('costs.export_csv')}
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
