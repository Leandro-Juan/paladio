"use client";

import React from 'react';
import { TicketType } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';

export type FilterCategory = 'all' | TicketType;

interface WalletFilterBarProps {
  currentCategory: FilterCategory;
  onSelectCategory: (cat: FilterCategory) => void;
  counts: Record<FilterCategory, number>;
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
    { id: 'all', label: 'ALL CREDENTIALS' },
    { id: 'flight', label: 'FLIGHTS' },
    { id: 'hotel', label: 'STAYS & PINS' },
    { id: 'attraction', label: 'ATTRACTIONS' },
    { id: 'transit', label: 'TRANSIT' },
    { id: 'other', label: 'OTHER' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Category Tabs */}
      <div
        role="tablist"
        aria-label="Ticket category filters"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
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
                background: isActive ? '#1E3A8A' : 'transparent',
                color: isActive ? '#93C5FD' : '#94A3B8',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {conf && <span>{conf.icon}</span>}
              <span>{cat.label}</span>
              <span
                style={{
                  fontSize: '10px',
                  background: isActive ? 'rgba(147, 197, 253, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#BFDBFE' : '#64748B',
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
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, ref, PNR..."
          aria-label="Search tickets"
          style={{
            width: '100%',
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '7px 28px 7px 10px',
            color: '#FFF',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
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
              color: '#94A3B8',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 4px',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
