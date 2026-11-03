"use client";

import React, { useMemo } from 'react';
import type { TripTicket } from '@/hooks/useTripTickets';
import { BarcodeStripe } from './BarcodeStripe';
import { getCurrencyInfo } from '@/utils/currencyResolver';

interface PastTripFlightTicketProps {
  ticket?: TripTicket | null;
  destination: string;
  startDate: string;
  endDate: string;
  travelersCount: number;
  totalCost?: number;
  currency?: string;
  origin?: string;
}

export function PastTripFlightTicket({
  ticket,
  destination,
  startDate,
  endDate,
  travelersCount,
  totalCost,
  currency = 'EUR',
  origin,
}: PastTripFlightTicketProps) {
  // Format departure date e.g. "December 25"
  const formattedDate = useMemo(() => {
    try {
      const d = ticket?.start_time
        ? new Date(ticket.start_time)
        : new Date(startDate);
      if (isNaN(d.getTime())) return startDate;
      return d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return startDate;
    }
  }, [ticket?.start_time, startDate]);

  // Compute days and nights
  const { days, nights } = useMemo(() => {
    try {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const diffDays = Math.max(
        1,
        Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );
      return { days: diffDays, nights: Math.max(0, diffDays - 1) };
    } catch {
      return { days: 1, nights: 0 };
    }
  }, [startDate, endDate]);

  const meta = (ticket?.metadata || {}) as Record<string, unknown>;

  const originName =
    (meta.departure_airport as string) ||
    (meta.origin_iata as string) ||
    (meta.departure_city as string) ||
    origin ||
    'Departure Hub';

  const destinationName =
    (meta.arrival_airport as string) ||
    (meta.destination_iata as string) ||
    (meta.arrival_city as string) ||
    destination;

  const flightNumber =
    (meta.flight_number as string) ||
    ticket?.provider ||
    'PLD-01';

  const barcodeValue =
    ticket?.barcode_value ||
    ticket?.booking_reference ||
    ticket?.reference_code ||
    ticket?.access_code ||
    (ticket?.id ? `PLD-${ticket.id.slice(0, 8)}` : `PLD-VAULT-${destination.slice(0, 3).toUpperCase()}`);

  const currencySymbol = getCurrencyInfo(currency).symbol;
  const formattedCost =
    typeof totalCost === 'number' && totalCost > 0
      ? `${currencySymbol} ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '1.25rem 1.15rem',
        boxShadow: 'var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.05))',
        border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header: Type and badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          className="font-mono text-muted"
          style={{
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          {ticket ? 'FLIGHT BOARDING PASS' : 'EXPEDITION VOYAGE'}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--color-accent-primary, #0F4C5C)',
            background: 'rgba(15, 76, 92, 0.08)',
            padding: '2px 7px',
            borderRadius: '999px',
          }}
        >
          {flightNumber}
        </span>
      </div>

      {/* Date and cost highlight */}
      <div>
        <div
          className="font-display"
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--color-accent-teal, #0F4C5C)',
            lineHeight: 1.2,
          }}
        >
          {formattedDate}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '2px',
          }}
        >
          <span
            className="font-mono text-muted"
            style={{ fontSize: '0.7rem' }}
          >
            {days} Days / {nights} Nights · {travelersCount} {travelersCount === 1 ? 'Traveler' : 'Travelers'}
          </span>
          {formattedCost && (
            <span
              className="font-display"
              style={{
                fontSize: '0.88rem',
                fontWeight: 700,
                color: 'var(--color-text-primary, #1A2B32)',
              }}
            >
              {formattedCost}
            </span>
          )}
        </div>
      </div>

      {/* Origin -> Destination Route Track (matching mockup visual) */}
      <div
        style={{
          position: 'relative',
          paddingLeft: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          margin: '0.35rem 0',
        }}
      >
        {/* Connecting track line */}
        <div
          style={{
            position: 'absolute',
            left: '5px',
            top: '7px',
            bottom: '7px',
            width: '2px',
            background: 'var(--color-border, #E2D9CC)',
          }}
          aria-hidden="true"
        />

        {/* Origin */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: '-1.25rem',
              top: '4px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '2.5px solid var(--color-accent-primary, #0F4C5C)',
            }}
            aria-hidden="true"
          />
          <div
            className="font-display"
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--color-text-primary, #1A2B32)',
              lineHeight: 1.2,
            }}
          >
            {originName}
          </div>
          <div
            className="font-mono text-muted"
            style={{ fontSize: '0.68rem', marginTop: '1px' }}
          >
            Origin Terminal
          </div>
        </div>

        {/* Destination */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: '-1.25rem',
              top: '4px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--color-accent-primary, #0F4C5C)',
            }}
            aria-hidden="true"
          />
          <div
            className="font-display"
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--color-text-primary, #1A2B32)',
              lineHeight: 1.2,
            }}
          >
            {destinationName}
          </div>
          <div
            className="font-mono text-muted"
            style={{ fontSize: '0.68rem', marginTop: '1px' }}
          >
            Destination Terminal
          </div>
        </div>
      </div>

      {/* Barcode separator and Barcode */}
      <div
        style={{
          borderTop: '1px dashed var(--color-border-subtle, rgba(15, 76, 92, 0.15))',
          paddingTop: '0.75rem',
        }}
      >
        <BarcodeStripe value={barcodeValue} height={34} />
      </div>
    </div>
  );
}
