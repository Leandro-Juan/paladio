"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import styles from './DemoFeatureGate.module.css';

interface DemoFeatureGateProps {
  children: React.ReactNode;
  message: string;
  compact?: boolean;
  borderRadius?: string;
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DemoFeatureGate({
  children,
  message,
  compact = false,
  borderRadius,
  minHeight,
  className,
  style,
}: DemoFeatureGateProps) {
  const { t } = useTranslation();
  const translatedMessage = t(message);

  return (
    <div
      className={`${styles.gateContainer} ${className || ''}`}
      style={{
        ...(borderRadius ? ({ '--demo-gate-radius': borderRadius } as React.CSSProperties) : {}),
        ...(minHeight ? { minHeight } : {}),
        ...style,
      }}
      data-demo-gated="true"
    >
      <div className={styles.gateContent} aria-hidden="true">
        {children}
      </div>

      <div
        className={styles.gateOverlay}
        role="status"
        aria-label={t('demo.gate_aria', { message: translatedMessage })}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className={`${styles.pill} ${compact ? styles.pillCompact : ''}`}>
          <span className={styles.badge}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t('demo.badge_label')}</span>
          </span>
          <span className={styles.message}>{translatedMessage}</span>
        </div>
      </div>
    </div>
  );
}

interface DemoLockedButtonProps {
  label: string;
  tooltip?: string;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Replaces an interactive submit CTA in demo mode while leaving surrounding form controls editable.
 */
export function DemoLockedButton({
  label,
  tooltip,
  fullWidth = false,
  className,
}: DemoLockedButtonProps) {
  const { t } = useTranslation();
  const resolvedLabel = t(label);
  const resolvedTooltip = tooltip ? t(tooltip) : resolvedLabel;

  return (
    <button
      type="button"
      aria-disabled="true"
      title={resolvedTooltip}
      aria-label={`${t('demo.badge_label')}: ${resolvedTooltip}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`${styles.lockedSubmitBtn} ${fullWidth ? styles.lockedSubmitFullWidth : ''} ${className || ''}`}
      data-demo-locked-button="true"
    >
      <span className={styles.badge}>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>{t('demo.badge_label')}</span>
      </span>
      <span>{resolvedLabel}</span>
    </button>
  );
}
