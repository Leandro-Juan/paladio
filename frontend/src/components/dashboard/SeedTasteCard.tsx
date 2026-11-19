"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { User } from '@/types/auth';
import { isTasteVectorNeutral } from '@/utils/tasteCalibration';
import styles from './SeedTasteCard.module.css';

interface SeedTasteCardProps {
  user: User | null;
}

const DISMISS_STORAGE_PREFIX = 'paladio_taste_seed_dismissed_';

export function SeedTasteCard({ user }: SeedTasteCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [dismissed, setDismissed] = useState<boolean>(true);

  const isNeutral = isTasteVectorNeutral(user);

  useEffect(() => {
    if (!user || !isNeutral) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const key = `${DISMISS_STORAGE_PREFIX}${user.id}`;
        const stored = window.localStorage.getItem(key);
        setDismissed(stored === '1');
      } catch {
        setDismissed(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, isNeutral]);

  if (!user || !isNeutral || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${user.id}`, '1');
    } catch {
      // Ignore storage failures in restricted contexts
    }
  };

  const handleStart = () => {
    router.push('/taste-calibration');
  };

  return (
    <aside
      className={styles.floatingCard}
      aria-label={t('dashboard.seed_taste_title')}
      role="region"
    >
      <div className={styles.topRow}>
        <span className={styles.badge}>
          <span className={styles.pulseDot} aria-hidden="true" />
          {t('dashboard.taste_vector_neutral_badge')}
        </span>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={handleDismiss}
          aria-label={t('dashboard.dismiss_taste_prompt_aria')}
          title={t('dashboard.dismiss')}
        >
          ×
        </button>
      </div>

      <h2 className={styles.title}>{t('dashboard.seed_taste_title')}</h2>
      <p className={styles.description}>
        {t('dashboard.seed_taste_desc')}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryCta} onClick={handleStart}>
          <span>{t('dashboard.calibrate_taste')}</span>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button type="button" className={styles.skipBtn} onClick={handleDismiss}>
          {t('dashboard.dismiss')}
        </button>
      </div>
    </aside>
  );
}
