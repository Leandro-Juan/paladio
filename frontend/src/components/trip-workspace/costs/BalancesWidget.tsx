"use client";

import React from 'react';
import { ParticipantBalance, TripParticipant } from '@/hooks/useTrips';

interface BalancesWidgetProps {
  balances: ParticipantBalance[];
  participants: TripParticipant[];
}

export function BalancesWidget({ balances = [], participants = [] }: BalancesWidgetProps) {
  const displayRows = participants.map((p) => {
    const b = balances.find((bal) => bal.participant_id === p.id);
    return {
      id: p.id,
      name: p.name || 'Traveler',
      totalPaid: b?.total_paid || 0,
      totalShare: b?.total_share || 0,
      netBalance: b?.net_balance || 0,
    };
  });

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
          fontFamily: 'var(--font-display, "Outfit", sans-serif)',
          fontSize: '0.85rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-primary, #0F172A)',
          marginBottom: '16px',
        }}
      >
        BALANCES
      </div>

      {displayRows.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted, #94A3B8)',
          }}
        >
          {`// NO TRAVELERS REGISTERED`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayRows.map((row, idx) => {
            const isPositive = row.netBalance > 0.01;
            const isNegative = row.netBalance < -0.01;
            const initial = (row.name || '?').charAt(0).toUpperCase();

            // Paladio themed avatar accents
            const colors = ['#1E3A8A', '#7C3AED', '#0284C7', '#D97706', '#059669'];
            const avatarBg = colors[idx % colors.length];

            return (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: avatarBg,
                      color: '#FFFFFF',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: 'var(--font-display, "Outfit", sans-serif)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                    }}
                  >
                    {initial}
                  </span>

                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body, "Inter", sans-serif)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary, #0F172A)',
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted, #64748B)',
                      }}
                    >
                      Paid €{row.totalPaid.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: isPositive ? '#059669' : isNegative ? '#DC2626' : 'var(--color-text-muted, #94A3B8)',
                  }}
                >
                  {isPositive ? `+€${row.netBalance.toFixed(2)}` : isNegative ? `-€${Math.abs(row.netBalance).toFixed(2)}` : '€0.00'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
