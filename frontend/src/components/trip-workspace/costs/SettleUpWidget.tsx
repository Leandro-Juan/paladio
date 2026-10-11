"use client";

import React from 'react';
import { SettlementTransfer } from '@/hooks/useTrips';

interface SettleUpWidgetProps {
  transfers: SettlementTransfer[];
  onAddPayment?: () => void;
  onSettleFlow?: (transfer: SettlementTransfer) => void;
}

export function SettleUpWidget({
  transfers = [],
  onAddPayment,
  onSettleFlow,
}: SettleUpWidgetProps) {
  const isSettled = transfers.length === 0;

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
          SETTLE UP · <span style={{ color: 'var(--color-accent-primary, #1E3A8A)' }}>{transfers.length}</span>
        </div>

        {onAddPayment && (
          <button
            type="button"
            onClick={onAddPayment}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #E2E8F0)',
              background: 'var(--color-surface-card, #F8FAFC)',
              color: 'var(--color-text-primary, #0F172A)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            className="hover:bg-slate-100"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add payment
          </button>
        )}
      </div>

      {isSettled ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(5, 150, 105, 0.12)',
              color: '#059669',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display, "Outfit", sans-serif)',
                fontSize: '0.96rem',
                fontWeight: 700,
                color: 'var(--color-text-primary, #0F172A)',
              }}
            >
              Everyone&apos;s square
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: '0.74rem',
                color: 'var(--color-text-muted, #64748B)',
                marginTop: '3px',
              }}
            >
              {`// NO PAYMENTS OUTSTANDING`}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {transfers.map((t, idx) => (
            <div
              key={`${t.sender_id}-${t.receiver_id}-${idx}`}
              style={{
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body, "Inter", sans-serif)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary, #0F172A)',
                  }}
                >
                  <span>{t.sender_name || 'Traveler'}</span>
                  <span style={{ color: '#94A3B8', margin: '0 6px' }}>➔</span>
                  <span>{t.receiver_name || 'Traveler'}</span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    fontSize: '0.7rem',
                    color: 'var(--color-text-muted, #64748B)',
                    marginTop: '2px',
                  }}
                >
                  DEBT SETTLEMENT
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#DC2626',
                  }}
                >
                  €{t.amount.toFixed(2)}
                </span>

                {onSettleFlow && (
                  <button
                    type="button"
                    onClick={() => onSettleFlow(t)}
                    style={{
                      border: 'none',
                      background: 'var(--color-accent-primary, #1E3A8A)',
                      color: '#FFFFFF',
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Settle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
