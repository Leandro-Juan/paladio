"use client";

import React, { useState, useEffect } from 'react';
import PreferenceRadar from '@/components/PreferenceRadar';
import { fetchCurrentUser } from '@/utils/api';
import { User } from '@/types/auth';
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
  const [fetchedAffinities, setFetchedAffinities] = useState<Record<string, number>>({});
  const [fetchedPace, setFetchedPace] = useState<string>('balanced');
  const [fetchedBudgetTier, setFetchedBudgetTier] = useState<string>('balanced');
  const [loading, setLoading] = useState<boolean>(!props.user && !props.tagAffinities);

  useEffect(() => {
    if (props.user || props.tagAffinities) return;

    let ignore = false;
    async function loadUserData() {
      try {
        const currentUser = await fetchCurrentUser();
        if (ignore) return;

        const prefs = (currentUser.preferences || {}) as Record<string, unknown>;
        const rawAffinities = (prefs.tag_affinities || {}) as Record<string, number>;

        const affinities: Record<string, number> = {};
        CATEGORY_MAP.forEach(({ key }) => {
          affinities[key] = typeof rawAffinities[key] === 'number' ? rawAffinities[key] : 0.5;
        });
        setFetchedAffinities(affinities);

        if (typeof prefs.pace === 'string') setFetchedPace(prefs.pace.toLowerCase());
        if (typeof prefs.budget_tier === 'string') setFetchedBudgetTier(prefs.budget_tier.toLowerCase());
      } catch (err) {
        console.warn('Failed to load user preferences for HarmonicRadarWidget', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadUserData();
    return () => {
      ignore = true;
    };
  }, [props.user, props.tagAffinities]);

  const affinities = props.tagAffinities || fetchedAffinities;
  const currentPace = (props.pace || fetchedPace || 'balanced').toLowerCase();
  const currentBudget = (props.budgetTier || fetchedBudgetTier || 'balanced').toLowerCase();

  const radarData = CATEGORY_MAP.map(({ key, label }) => ({
    subject: label,
    A: Math.round((affinities[key] ?? 0.5) * 100),
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
      <div className={styles.radarCard} style={{ justifyContent: 'center' }}>
        <p className="font-mono text-muted text-xs">{'// LOADING 8-POINT HARMONIC RADAR...'}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.radarCard}>
        <div className={styles.header}>
          <span className={styles.headerTag}>{'// 8-POINT HARMONIC RADAR'}</span>
          <span className={styles.utilityTag}>C++20 UTILITY</span>
        </div>

        <div className={styles.chartWrapper}>
          <PreferenceRadar data={radarData} height={215} outerRadius="62%" fontSize={10} />
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
