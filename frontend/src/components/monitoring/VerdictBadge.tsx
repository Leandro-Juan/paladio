"use client";

import React from 'react';
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
  if (!verdict) return null;

  const actualSize = size || (compact ? 'sm' : 'md');
  const vNorm = verdict.toUpperCase();

  let verdictClass = styles.verdictTypical;
  let icon = '•';
  let label = 'Typical';

  if (vNorm === 'GREAT') {
    verdictClass = styles.verdictGreat;
    icon = '★';
    label = 'Great Deal';
  } else if (vNorm === 'GOOD') {
    verdictClass = styles.verdictGood;
    icon = '↓';
    label = 'Good Price';
  } else if (vNorm === 'HIGH') {
    verdictClass = styles.verdictHigh;
    icon = '↑';
    label = 'High';
  } else if (vNorm === 'PEAK') {
    verdictClass = styles.verdictPeak;
    icon = '▲';
    label = 'Peak Surge';
  }

  const sizeClass = actualSize === 'sm' ? styles.sizeSm : actualSize === 'lg' ? styles.sizeLg : styles.sizeMd;

  const confClass =
    confidence === 'established'
      ? styles.confidenceEstablished
      : confidence === 'building'
      ? styles.confidenceBuilding
      : styles.confidenceProvisional;

  return (
    <div className={styles.badgeWrapper}>
      <span
        className={`${styles.badge} ${verdictClass} ${sizeClass}`}
        title={percentile !== null && percentile !== undefined ? `Percentile: P${percentile.toFixed(0)}` : undefined}
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
          title={
            confidence === 'established'
              ? 'Backed by 21+ days of time-series observations'
              : 'Provisional baseline from forward calendar sweep'
          }
        >
          {confidence}
        </span>
      )}
    </div>
  );
}
