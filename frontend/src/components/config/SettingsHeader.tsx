"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();

  return (
    <header className={styles.detailHeader}>
      <div>
        <button
          type="button"
          onClick={onBackToOverview}
          className={styles.detailBackBtn}
          aria-label={t('config.return_to_overview')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>{t('config.overview_upper')}</span>
        </button>

        <h1 className={styles.detailTitle}>{t(title)}</h1>
        {subtitle && <p className={styles.detailSubtitle}>{t(subtitle)}</p>}
      </div>

      {actions && <div className={styles.detailActions}>{actions}</div>}
    </header>
  );
}
