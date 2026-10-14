"use client";

import React from 'react';
import { TicketType } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { SearchIcon, CloseIcon } from '@/components/icons';

export type FilterCategory = 'all' | TicketType;

interface WalletFilterBarProps {
  currentCategory: FilterCategory;
  onSelectCategory: (cat: FilterCategory) => void;
  counts: Record<string, number>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function WalletFilterBar({
  currentCategory,
  onSelectCategory,
  counts,
  searchQuery,
  onSearchChange,
}: WalletFilterBarProps) {
  const categories: Array<{ id: FilterCategory; label: string }> = [
    { id: 'all', label: 'All Tickets' },
    { id: 'flight', label: 'Flights' },
    { id: 'hotel', label: 'Stays & Keys' },
    { id: 'attraction', label: 'Attractions' },
    { id: 'transit', label: 'Transit' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        width: '100%',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Category Filter Tabs */}
      <div
        role="tablist"
        aria-label="Filter tickets by category"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '8px',
          padding: '4px',
          overflowX: 'auto',
          maxWidth: '100%',
        }}
      >
        {categories.map((cat) => {
          const isActive = currentCategory === cat.id;
          const count = counts[cat.id] || 0;
          const conf = cat.id !== 'all' ? TICKET_TYPE_CONFIG[cat.id] : null;

          return (
            <button
              key={cat.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectCategory(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? 'var(--color-accent-primary)' : 'transparent',
                color: isActive ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {conf && <span>{conf.renderIcon({ size: 13, color: isActive ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)' })}</span>}
              <span>{cat.label}</span>
              <span
                style={{
                  fontSize: '10px',
                  background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'var(--color-surface-subtle, rgba(0, 0, 0, 0.05))',
                  color: isActive ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative', minWidth: '220px', flex: '0 1 280px' }}>
        <div
          style={{
            position: 'absolute',
            left: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <SearchIcon size={13} color="var(--color-text-muted)" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, ref, PNR..."
          aria-label="Search tickets"
          style={{
            width: '100%',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '6px',
            padding: '7px 28px 7px 26px',
            color: 'var(--color-text-main)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
            outline: 'none',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted, #64748B)',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseIcon size={12} color="var(--color-text-muted, #64748B)" />
          </button>
        )}
      </div>
    </div>
  );
}
