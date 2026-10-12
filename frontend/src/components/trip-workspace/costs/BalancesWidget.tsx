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
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '16px',
        padding: '22px 24px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display, "Jost", sans-serif)',
          fontSize: '0.85rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-main)',
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
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
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

            // Pacific Jazz palette avatars
            const colors = [
              'var(--color-accent-primary)',
              'var(--color-accent-muted)',
              'var(--color-accent-secondary)',
              '#14788D',
              '#0F4C5C',
            ];
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
                      color: 'var(--color-text-on-accent)',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: 'var(--font-display, "Jost", sans-serif)',
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
                        color: 'var(--color-text-main)',
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      Paid €{row.totalPaid.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontFeatureSettings: '"tnum"',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    textAlign: 'right',
                    color: isPositive ? 'var(--color-success)' : isNegative ? 'var(--color-danger)' : 'var(--color-text-muted)',
                  }}
                >
                  <div>
                    {isPositive ? `+€${row.netBalance.toFixed(2)}` : isNegative ? `-€${Math.abs(row.netBalance).toFixed(2)}` : '€0.00'}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    {isPositive ? 'is owed' : isNegative ? 'owes' : 'settled'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
