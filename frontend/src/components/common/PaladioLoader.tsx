"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import styles from './PaladioLoader.module.css';

export interface PaladioLoaderProps {
  /**
   * Layout presentation style.
   * - 'dashboard': Centered in dashboard viewport (default)
   * - 'card': Compact layout for inside cards or widget tiles
   * - 'fullscreen': Fixed 100vh overlay
   */
  variant?: 'dashboard' | 'card' | 'fullscreen';
  /**
   * Scale size of logo and spinner ('sm' | 'md' | 'lg').
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to display the Paladio logo. Defaults to true.
   */
  showLogo?: boolean;
  /**
   * Additional custom CSS class name.
   */
  className?: string;
  /**
   * Optional status message or component to display beneath spinner.
   */
  message?: React.ReactNode;
}

export function PaladioLoader({
  variant = 'dashboard',
  size,
  showLogo = true,
  className = '',
  message,
}: PaladioLoaderProps) {
  const { t } = useTranslation();
  // Determine effective size based on variant if not explicitly provided
  const effectiveSize = size || (variant === 'card' ? 'sm' : 'md');

  const variantClass =
    variant === 'fullscreen'
      ? styles.variantFullscreen
      : variant === 'card'
      ? styles.variantCard
      : styles.variantDashboard;

  const sizeClass =
    effectiveSize === 'sm'
      ? styles.sizeSm
      : effectiveSize === 'lg'
      ? styles.sizeLg
      : '';

  // Spinner dimensions
  const spinnerDimensions =
    effectiveSize === 'sm' ? 22 : effectiveSize === 'lg' ? 44 : 34;

  const strokeWidth = effectiveSize === 'sm' ? 2.8 : 2.5;

  return (
    <div
      className={`${styles.container} ${variantClass} ${sizeClass} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {/* Paladio Brand Logo */}
      {showLogo && (
        <div className={styles.logoWrapper}>
          <img
            src="/logo-horizontal.png"
            alt={t('common.paladio_logo')}
            className={`${styles.logoImage} brand-logo-light`}
          />
          <img
            src="/logo-horizontal-dark.png"
            alt={t('common.paladio_logo')}
            className={`${styles.logoImage} brand-logo-dark`}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* High-Precision Tactical Spinner */}
      <div className={styles.spinnerWrapper}>
        <div className={styles.pulseGlow} />
        <svg
          width={spinnerDimensions}
          height={spinnerDimensions}
          viewBox="0 0 40 40"
          fill="none"
          className={styles.spinnerSvg}
          aria-hidden="true"
        >
          {/* Subtle base track */}
          <circle
            cx="20"
            cy="20"
            r="16"
            strokeWidth={strokeWidth}
            className={styles.trackRing}
          />
          {/* Vermilion accent rotating arc */}
          <path
            d="M20 4 A 16 16 0 0 1 36 20"
            strokeWidth={strokeWidth}
            className={styles.accentArc}
          />
        </svg>
      </div>

      {message && (
        <div className={styles.messageWrapper}>
          {typeof message === 'string' ? t(message) : message}
        </div>
      )}
    </div>
  );
}

export default PaladioLoader;
