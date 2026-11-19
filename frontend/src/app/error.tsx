'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { AlertTriangleIcon, ChevronLeftIcon } from '@/components/icons';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg-main, #0A0A0C)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          background: 'var(--color-surface-card, #141418)',
          border: '1px solid var(--color-danger, #EF4444)',
          borderRadius: '12px',
          padding: '2.5rem 2rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--color-danger, #EF4444)' }}>
          <AlertTriangleIcon size={36} />
        </div>
        <h3
          className="font-display"
          style={{
            color: 'var(--color-danger, #EF4444)',
            margin: 0,
            fontSize: '1.25rem',
            letterSpacing: '0.05em',
          }}
        >
          {t('errors.telemetry_fault_title')}
        </h3>
        <p
          className="font-mono text-muted text-sm mt-3"
          style={{
            color: 'var(--color-text-muted, #8E8E93)',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {error.message ? t(error.message) : t('errors.unexpected_rendering_exception')}
        </p>
        {error.digest && (
          <p
            className="font-mono text-xs mt-1"
            style={{ color: 'var(--color-text-subtle, #555560)' }}
          >
            {t('errors.fault_digest', { digest: error.digest })}
          </p>
        )}
        <div
          style={{
            marginTop: '2rem',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              background: 'var(--color-accent-primary, #D08770)',
              color: 'var(--color-text-on-accent, #FFFFFF)',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {t('errors.retry_operation')}
          </button>
          <Link
            href="/dashboard"
            style={{
              padding: '10px 20px',
              background: 'var(--color-surface-elevated, #1F1F24)',
              color: 'var(--color-text-main, #ECEFF4)',
              border: '1px solid var(--color-border-subtle, #2E2E38)',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <ChevronLeftIcon size={14} style={{ marginRight: '6px' }} /> {t('errors.return_to_dashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
