"use client";

import React from 'react';
import styles from '@/app/config/config.module.css';

interface SettingsHeaderProps {
  title: string;
  subtitle?: string;
  onBackToOverview: () => void;
  actions?: React.ReactNode;
}

export function SettingsHeader({
  title,
  subtitle,
  onBackToOverview,
  actions,
}: SettingsHeaderProps) {
  return (
    <header className={styles.detailHeader}>
      <div>
        <button
          type="button"
          onClick={onBackToOverview}
          className={styles.detailBackBtn}
          aria-label="Return to Settings Overview"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>OVERVIEW</span>
        </button>

        <h1 className={styles.detailTitle}>{title}</h1>
        {subtitle && <p className={styles.detailSubtitle}>{subtitle}</p>}
      </div>

      {actions && <div className={styles.detailActions}>{actions}</div>}
    </header>
  );
}
