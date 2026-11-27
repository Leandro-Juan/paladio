"use client";

import React, { useState } from 'react';
import { CopyButton } from './CopyButton';
import { useTranslation } from '@/hooks/useTranslation';

interface SecretFieldProps {
  value: string;
  label?: string;
  placeholder?: string;
  highlight?: boolean;
}

export function SecretField({ value, label, highlight = false }: SecretFieldProps) {
  const { t } = useTranslation();
  const [isRevealed, setIsRevealed] = useState(false);

  if (!value) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
        padding: highlight ? '4px 8px' : '2px 6px',
        borderRadius: '6px',
        maxWidth: '100%',
        minWidth: 0,
        background: highlight ? 'var(--color-accent-warning-bg, rgba(226, 179, 60, 0.12))' : 'var(--color-surface-card, #F8FAFC)',
        border: `1px solid ${highlight ? 'var(--color-accent-warning-border, rgba(226, 179, 60, 0.35))' : 'var(--color-border, #CBD5E1)'}`,
      }}
    >
      {label && (
        <span
          className="font-mono"
          style={{
            fontSize: '10px',
            color: highlight ? 'var(--color-accent-warning, #B45309)' : 'var(--color-text-muted, #64748B)',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {label}:
        </span>
      )}
      <span
        className="font-mono"
        style={{
          fontSize: highlight ? '13px' : '11px',
          fontWeight: 700,
          color: highlight ? 'var(--color-accent-warning, #B45309)' : 'var(--color-text-primary, #0F172A)',
          letterSpacing: isRevealed ? '0.5px' : '2px',
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {isRevealed ? value : '••••••••'}
      </span>

      {/* Reveal Toggle */}
      <button
        type="button"
        onClick={() => setIsRevealed((prev) => !prev)}
        aria-label={isRevealed ? t('wallet.hide_secret_aria') : t('wallet.reveal_secret_aria')}
        title={isRevealed ? t('wallet.hide_label') : t('wallet.reveal_label')}
        style={{
          background: 'none',
          border: 'none',
          color: highlight ? 'var(--color-accent-warning, #D97706)' : 'var(--color-text-muted, #64748B)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
        }}
      >
        {isRevealed ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>

      {/* Copy Secret Button */}
      <CopyButton value={value} label={t('wallet.copy_secret')} />
    </div>
  );
}
