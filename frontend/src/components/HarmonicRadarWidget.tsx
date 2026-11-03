"use client";

import React, { useState, useEffect } from 'react';
import PreferenceRadar from '@/components/PreferenceRadar';
import { fetchCurrentUser } from '@/utils/api';
import { User } from '@/types/auth';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import styles from './HarmonicRadarWidget.module.css';

interface TagConfig {
  key: string;
  label: string;
}

const CATEGORY_MAP: TagConfig[] = [
  { key: 'art_culture', label: 'Art & Culture' },
  { key: 'history_heritage', label: 'Historical Sites' },
  { key: 'nature_outdoors', label: 'Nature & Outdoors' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'food_culinary', label: 'Culinary & Food' },
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'shopping', label: 'Shopping & Bazaars' },
  { key: 'scenic_views', label: 'Scenic Views' },
];

export interface HarmonicRadarWidgetProps {
  user?: User | null;
  tagAffinities?: Record<string, number>;
  pace?: string;
  budgetTier?: string;
}

export function HarmonicRadarWidget(props: HarmonicRadarWidgetProps) {
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

  const radarData = CATEGORY_MAP.map(({ key, label }) => ({
    subject: label,
    A: Math.round(((affinities && typeof affinities[key] === 'number') ? affinities[key] : 0.5) * 100),
    fullMark: 100,
  }));

  const dwellDescription =
    currentPace === 'leisurely'
      ? '90-150m dwell'
      : currentPace === 'intense'
      ? '30-60m highlights'
      : '60-90m baseline';

  const budgetDescription =
    currentBudget === 'budget'
      ? 'Cost sensitive'
      : currentBudget === 'luxury'
      ? 'Zero penalty'
      : 'Moderate tolerance';

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
          <span className={styles.headerTag}>Taste Star</span>
        </div>

        <div className={styles.chartWrapper}>
          <PreferenceRadar data={radarData} height={240} outerRadius="72%" fontSize={10} />
        </div>

        <p className={styles.caption}>
          Multi-attribute utility projection feeding branch-and-bound optimization.
        </p>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>TRAVEL PACE</span>
          <span className={styles.statusValue}>{currentPace}</span>
          <span className={styles.statusSubtext}>{dwellDescription}</span>
        </div>

        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>BUDGET STRATEGY</span>
          <span className={styles.statusValue}>{currentBudget}</span>
          <span className={styles.statusSubtext}>{budgetDescription}</span>
        </div>
      </div>
    </div>
  );
}
