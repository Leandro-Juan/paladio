"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';

interface WalletSummaryBarProps {
  tickets: TripTicket[];
  isSyncing?: boolean;
  onSyncItinerary?: () => void;
  hasDrift?: boolean;
  onOpenCreateModal?: () => void;
}

export function WalletSummaryBar({
  tickets,
  isSyncing = false,
  onSyncItinerary,
  hasDrift = false,
  onOpenCreateModal,
}: WalletSummaryBarProps) {
  const counts = {
    total: tickets.filter((t) => t.status !== 'cancelled').length,
    flight: tickets.filter((t) => t.ticket_type === 'flight' && t.status !== 'cancelled').length,
    hotel: tickets.filter((t) => t.ticket_type === 'hotel' && t.status !== 'cancelled').length,
    attraction: tickets.filter((t) => t.ticket_type === 'attraction' && t.status !== 'cancelled').length,
    transit: tickets.filter((t) => t.ticket_type === 'transit' && t.status !== 'cancelled').length,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Drift alert banner if itinerary changed */}
      {hasDrift && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '8px',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#FCD34D' }}>
            <span>⚠</span>
            <span>
              <strong>ITINERARY DRIFT DETECTED:</strong> Trip details were modified since tickets were seeded. User edits were preserved.
            </span>
          </div>
          {onSyncItinerary && (
            <button
              type="button"
              onClick={onSyncItinerary}
              disabled={isSyncing}
              style={{
                background: 'rgba(245, 158, 11, 0.25)',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                color: '#FEF3C7',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {isSyncing ? 'RECONCILING...' : 'RE-SYNC ITINERARY'}
            </button>
          )}
        </div>
      )}

      {/* Main Bar */}
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '10px',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* Metric Counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>TOTAL TICKETS:</span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFF',
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '1px 7px',
                borderRadius: '4px',
              }}
            >
              {counts.total}
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.15)' }} />

          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#CBD5E1' }}>
            <span title="Flights">
              ✈️ <strong>{counts.flight}</strong>
            </span>
            <span title="Stays & Access Codes">
              🏨 <strong>{counts.hotel}</strong>
            </span>
            <span title="Attraction Passes">
              🏛️ <strong>{counts.attraction}</strong>
            </span>
            <span title="Transit Passes">
              🚆 <strong>{counts.transit}</strong>
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onSyncItinerary && (
            <button
              type="button"
              onClick={onSyncItinerary}
              disabled={isSyncing}
              aria-label="Sync tickets from itinerary"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                color: '#CBD5E1',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              <span>🔄</span>
              <span>{isSyncing ? 'SYNCING…' : 'SYNC FROM ITINERARY'}</span>
            </button>
          )}

          {onOpenCreateModal && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              style={{
                background: '#2563EB',
                border: '1px solid #3B82F6',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '11px',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1D4ED8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563EB';
              }}
            >
              <span>+</span>
              <span>ADD TICKET</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
