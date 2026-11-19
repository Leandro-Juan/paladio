"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import styles from './VerdictBadge.module.css';

interface VerdictBadgeProps {
  verdict?: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | string | null;
  percentile?: number | null;
  confidence?: 'building' | 'provisional' | 'established' | string | null;
  showConfidence?: boolean;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

export function VerdictBadge({
  verdict,
  percentile,
  confidence,
  showConfidence = false,
  size,
  compact = false,
}: VerdictBadgeProps) {
  const { t } = useTranslation();

  if (!verdict) return null;

  const actualSize = size || (compact ? 'sm' : 'md');
  const vNorm = verdict.toUpperCase();

  let verdictClass = styles.verdictTypical;
  let icon = '•';
  let label = t('monitoring.verdict_typical');

  if (vNorm === 'GREAT') {
    verdictClass = styles.verdictGreat;
    icon = '★';
    label = t('monitoring.verdict_great_deal');
  } else if (vNorm === 'GOOD') {
    verdictClass = styles.verdictGood;
    icon = '↓';
    label = t('monitoring.verdict_good_price');
  } else if (vNorm === 'HIGH') {
    verdictClass = styles.verdictHigh;
    icon = '↑';
    label = t('monitoring.verdict_high');
  } else if (vNorm === 'PEAK') {
    verdictClass = styles.verdictPeak;
    icon = '▲';
    label = t('monitoring.verdict_peak_surge');
  }

  const sizeClass = actualSize === 'sm' ? styles.sizeSm : actualSize === 'lg' ? styles.sizeLg : styles.sizeMd;

  const confClass =
    confidence === 'established'
      ? styles.confidenceEstablished
      : confidence === 'building'
      ? styles.confidenceBuilding
      : styles.confidenceProvisional;

  const confidenceLabel =
    confidence === 'established'
      ? t('monitoring.confidence_established')
      : confidence === 'building'
      ? t('monitoring.confidence_building')
      : confidence === 'provisional'
      ? t('monitoring.confidence_provisional')
      : confidence;

  return (
    <div className={styles.badgeWrapper}>
      <span
        className={`${styles.badge} ${verdictClass} ${sizeClass}`}
        data-tooltip={
          percentile !== null && percentile !== undefined
            ? t('monitoring.percentile_tooltip', { pct: percentile.toFixed(0) })
            : undefined
        }
        data-tooltip-position="top"
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
        {percentile !== null && percentile !== undefined && (
          <span style={{ opacity: 0.85, fontSize: '0.9em' }}>
            {percentile <= 25 ? `P${Math.round(percentile)}` : ''}
          </span>
        )}
      </span>

      {showConfidence && confidence && (
        <span
          className={`${styles.confidencePill} ${confClass}`}
          data-tooltip={
            confidence === 'established'
              ? t('monitoring.confidence_established_tooltip')
              : t('monitoring.confidence_provisional_tooltip')
          }
          data-tooltip-position="top"
        >
          {confidenceLabel}
        </span>
      )}
    </div>
  );
}
