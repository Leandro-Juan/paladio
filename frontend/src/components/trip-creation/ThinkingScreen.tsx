"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface ThinkingScreenProps {
  message: string;
  subMessage?: string;
  error?: string | null;
  onDismissError?: () => void;
}

export function ThinkingScreen({
  message,
  subMessage,
  error,
  onDismissError,
}: ThinkingScreenProps) {
  const { t } = useTranslation();
  return (
    <div
      className="paladio-thinking-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        width: '100%',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
    >
      {!error ? (
        <>
          {/* Three dots thinking animation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '2.25rem',
            }}
          >
            <div className="paladio-thinking-dot dot-1" />
            <div className="paladio-thinking-dot dot-2" />
            <div className="paladio-thinking-dot dot-3" />
          </div>

          {/* Dynamic text displaying what it is doing */}
          <h3
            className="font-display"
            style={{
              margin: 0,
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--color-text-primary, #111827)',
              letterSpacing: '-0.02em',
              maxWidth: '620px',
              lineHeight: 1.45,
              transition: 'all 0.25s ease',
            }}
          >
            {message}
          </h3>

          {subMessage && (
            <p
              style={{
                margin: '0.85rem 0 0 0',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary, #6B7280)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {subMessage}
            </p>
          )}
        </>
      ) : (
        /* Error presentation */
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-danger, #EF4444)',
            borderRadius: '20px',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-danger, #EF4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto',
              fontSize: '1.25rem',
              fontWeight: 700,
            }}
          >
            !
          </div>

          <h4
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.15rem',
              fontWeight: 600,
              color: 'var(--color-danger, #EF4444)',
            }}
          >
            {t('engine.thinking_error_heading')}
          </h4>

          <p
            style={{
              margin: '0 0 1.5rem 0',
              fontSize: '0.9rem',
              color: 'var(--color-text-secondary, #4B5563)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>

          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              style={{
                background: 'var(--color-text-primary, #111827)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '0.75rem 1.75rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              {t('engine.back_to_trip_editor')}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .paladio-thinking-root {
          animation: paladioThinkingEnter var(--duration-gentle) var(--ease-snappy);
        }

        .paladio-thinking-dot {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: var(--color-text-primary, #0F4C5C);
          animation: paladioThinkingPulse 1.4s infinite ease-in-out both;
        }

        .dot-1 {
          animation-delay: -0.32s;
        }

        .dot-2 {
          animation-delay: -0.16s;
        }

        .dot-3 {
          animation-delay: 0s;
        }

        @keyframes paladioThinkingPulse {
          0%, 80%, 100% {
            transform: scale(0.45);
            opacity: 0.25;
          }
          40% {
            transform: scale(1.15);
            opacity: 1;
          }
        }

        @keyframes paladioThinkingEnter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .paladio-thinking-root {
            animation: none !important;
          }
          .paladio-thinking-dot {
            animation: none !important;
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
