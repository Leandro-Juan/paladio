"use client";

import React from 'react';
import styles from './RadialPriceGauge.module.css';

interface RadialPriceGaugeProps {
  percentile: number | null; // 0.0 (super deal) to 100.0 (peak)
  currentPrice: number | null;
  p10Deal: number | null;
  p50Median: number | null;
  p90Peak: number | null;
  currency?: string;
}

export function RadialPriceGauge({
  percentile,
  currentPrice,
  p10Deal,
  p50Median,
  p90Peak,
  currency = 'EUR',
}: RadialPriceGaugeProps) {
  const cx = 120;
  const cy = 110;
  const r = 85;
  const strokeWidth = 14;

  const pct = percentile !== null ? Math.max(0, Math.min(100, percentile)) : 50;
  const angleDeg = -180 + (pct / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  const pinX = cx + r * Math.cos(angleRad);
  const pinY = cy + r * Math.sin(angleRad);

  const arcLength = Math.PI * r;
  const strokeDashoffset = arcLength * (1 - pct / 100);

  const isSuperDeal = percentile !== null && percentile <= 20;
  const isNormal = percentile !== null && percentile > 20 && percentile <= 70;
  const isPeak = percentile !== null && percentile > 70;
  const symbol = currency === 'EUR' ? '€' : `${currency} `;

  return (
    <div className={styles.container} role="region" aria-label="Route price gauge">
      <div className={styles.header}>
        <div>
          <span className={styles.telemetryTag} aria-hidden="true">{"// LIVE_MARKET_READING"}</span>
          <h4 className={styles.title}>Price Quantile Gauge</h4>
        </div>
        <div className={styles.statusPills}>
          {isSuperDeal && <span className={styles.dealPill}>SUPER DEAL (P10)</span>}
          {isNormal && <span className={styles.normalPill}>FAIR VALUE (P50)</span>}
          {isPeak && <span className={styles.peakPill}>PEAK TARIFF (P90)</span>}
        </div>
      </div>

      <div className={styles.gaugeLayout}>
        <div className={styles.svgWrapper}>
          <svg
            viewBox="0 0 240 135"
            className={styles.gaugeSvg}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--color-accent-teal-mid, #14788D)" />
                <stop offset="50%" stopColor="var(--color-accent-gold, #E2B33C)" />
                <stop offset="100%" stopColor="var(--color-accent-secondary, #D42A2F)" />
              </linearGradient>
            </defs>

            <path
              d="M 35 110 A 85 85 0 0 1 205 110"
              fill="none"
              stroke="var(--color-border, #E2E8F0)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {percentile !== null && (
              <path
                d="M 35 110 A 85 85 0 0 1 205 110"
                fill="none"
                stroke="url(#gaugeGradient)"
                strokeWidth={strokeWidth}
                strokeDasharray={arcLength}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={styles.valueArc}
              />
            )}

            {percentile !== null && (
              <circle
                cx={pinX}
                cy={pinY}
                r="7"
                fill="var(--color-surface-card, #FFFFFF)"
                stroke="var(--color-accent-primary, #0F4C5C)"
                strokeWidth="3.5"
                className={styles.needlePoint}
              />
            )}

            <text x="35" y="130" className={styles.axisText} textAnchor="start">0%</text>
            <text x="120" y="130" className={styles.axisText} textAnchor="middle">P50</text>
            <text x="205" y="130" className={styles.axisText} textAnchor="end">100%</text>
          </svg>
        </div>

        <div className={styles.metricDetails}>
          <div className={styles.priceRow}>
            <span className={styles.mainPrice}>
              {currentPrice !== null ? `${symbol}${currentPrice.toFixed(2)}` : 'Scanning...'}
            </span>
            <span className={styles.percentileBadge}>
              {percentile !== null ? `${percentile.toFixed(1)}%` : '--'}
            </span>
          </div>
          <span className={styles.subtext}>
            {percentile !== null && percentile <= 20
              ? 'Lowest 20th percentile. High-confidence buy window.'
              : 'Current observation against route historical distribution.'}
          </span>

          <div className={styles.thresholdsGrid}>
            <div className={styles.thresholdItem}>
              <span className={styles.thresholdLabel}>P10 Deal Target</span>
              <span className={styles.thresholdValue}>
                {p10Deal !== null ? `${symbol}${p10Deal.toFixed(2)}` : '--'}
              </span>
            </div>
            <div className={styles.thresholdItem}>
              <span className={styles.thresholdLabel}>P50 Median</span>
              <span className={styles.thresholdValue}>
                {p50Median !== null ? `${symbol}${p50Median.toFixed(2)}` : '--'}
              </span>
            </div>
            <div className={styles.thresholdItem}>
              <span className={styles.thresholdLabel}>P90 Peak Ceiling</span>
              <span className={styles.thresholdValue}>
                {p90Peak !== null ? `${symbol}${p90Peak.toFixed(2)}` : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
