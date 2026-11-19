"use client";

import React, { useState, useEffect } from 'react';
import PreferenceRadar from '@/components/PreferenceRadar';
import { fetchCurrentUser } from '@/utils/api';
import { User } from '@/types/auth';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { useTranslation } from '@/hooks/useTranslation';
import styles from './HarmonicRadarWidget.module.css';

interface TagConfig {
  key: string;
  labelKey: string;
}

const CATEGORY_MAP: TagConfig[] = [
  { key: 'art_culture', labelKey: 'categories.art_culture' },
  { key: 'history_heritage', labelKey: 'preferences.cat_history_heritage' },
  { key: 'nature_outdoors', labelKey: 'categories.nature_outdoors' },
  { key: 'architecture', labelKey: 'categories.architecture' },
  { key: 'food_culinary', labelKey: 'preferences.cat_food_culinary' },
  { key: 'nightlife', labelKey: 'categories.nightlife' },
  { key: 'shopping', labelKey: 'preferences.cat_shopping' },
  { key: 'scenic_views', labelKey: 'categories.scenic_views' },
];

export interface HarmonicRadarWidgetProps {
  user?: User | null;
  tagAffinities?: Record<string, number>;
  pace?: string;
  budgetTier?: string;
}

export function HarmonicRadarWidget(props: HarmonicRadarWidgetProps) {
  const { t } = useTranslation();
  const [fetchedUser, setFetchedUser] = useState<User | null>(null);
  const [fetchLoading, setFetchLoading] = useState<boolean>(!props.user && !props.tagAffinities);

  useEffect(() => {
    if (props.user || props.tagAffinities) return;

    let ignore = false;
    async function loadUserData() {
      try {
        const currentUser = await fetchCurrentUser();
        if (ignore) return;
        setFetchedUser(currentUser);
      } catch (err) {
        console.warn('Failed to load user preferences for HarmonicRadarWidget', err);
      } finally {
        if (!ignore) setFetchLoading(false);
      }
    }

    loadUserData();
    return () => {
      ignore = true;
    };
  }, [props.user, props.tagAffinities]);

  const loading = !props.user && !props.tagAffinities && fetchLoading;

  const effectiveUser = props.user ?? fetchedUser;
  const userPrefs = (effectiveUser?.preferences || {}) as Record<string, unknown>;
  const userAffinities = (userPrefs.tag_affinities || {}) as Record<string, number>;
  const userPace = typeof userPrefs.pace === 'string' ? userPrefs.pace : undefined;
  const userBudget = typeof userPrefs.budget_tier === 'string' ? userPrefs.budget_tier : undefined;

  const affinities = props.tagAffinities ?? userAffinities;
  const currentPace = (props.pace ?? userPace ?? 'balanced').toLowerCase();
  const currentBudget = (props.budgetTier ?? userBudget ?? 'balanced').toLowerCase();

  const radarData = CATEGORY_MAP.map(({ key, labelKey }) => ({
    subject: t(labelKey),
    A: Math.round(((affinities && typeof affinities[key] === 'number') ? affinities[key] : 0.5) * 100),
    fullMark: 100,
  }));

  const paceLabel =
    currentPace === 'leisurely'
      ? t('preferences.pace_leisurely')
      : currentPace === 'intense'
      ? t('preferences.pace_intense')
      : currentPace === 'balanced'
      ? t('preferences.pace_balanced')
      : currentPace;

  const budgetLabel =
    currentBudget === 'budget'
      ? t('preferences.budget_budget')
      : currentBudget === 'luxury'
      ? t('preferences.budget_luxury')
      : currentBudget === 'balanced'
      ? t('preferences.budget_balanced')
      : currentBudget;

  const dwellDescription =
    currentPace === 'leisurely'
      ? t('preferences.dwell_leisurely')
      : currentPace === 'intense'
      ? t('preferences.dwell_intense')
      : t('preferences.dwell_balanced');

  const budgetDescription =
    currentBudget === 'budget'
      ? t('preferences.budget_desc_budget')
      : currentBudget === 'luxury'
      ? t('preferences.budget_desc_luxury')
      : t('preferences.budget_desc_balanced');

  if (loading) {
    return (
      <div className={styles.radarCard} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <PaladioLoader variant="card" showLogo={false} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.radarCard}>
        <div className={styles.header}>
          <span className={styles.headerTag}>{t('preferences.taste_star')}</span>
        </div>

        <div className={styles.chartWrapper}>
          <PreferenceRadar data={radarData} height={240} outerRadius="72%" fontSize={10} />
        </div>

        <p className={styles.caption}>
          {t('preferences.taste_star_caption')}
        </p>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>{t('preferences.travel_pace_label')}</span>
          <span className={styles.statusValue}>{paceLabel}</span>
          <span className={styles.statusSubtext}>{dwellDescription}</span>
        </div>

        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>{t('preferences.budget_strategy_label')}</span>
          <span className={styles.statusValue}>{budgetLabel}</span>
          <span className={styles.statusSubtext}>{budgetDescription}</span>
        </div>
      </div>
    </div>
  );
}
