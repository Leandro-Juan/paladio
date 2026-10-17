"use client";

import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { HistoryPoint } from '@/hooks/useRouteMonitoring';
import styles from './PriceTrendGraph.module.css';

interface PriceTrendGraphProps {
  points: HistoryPoint[];
  p10Deal: number | null;
  p50Median: number | null;
  p90Peak: number | null;
  currency?: string;
  onRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
}

export function PriceTrendGraph({
  points,
  p10Deal,
  p50Median,
  p90Peak,
  currency = 'EUR',
  onRangeChange,
}: PriceTrendGraphProps) {
  const [activeRange, setActiveRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');

  const handleRangeClick = (range: '24h' | '7d' | '30d' | '90d') => {
    setActiveRange(range);
    if (onRangeChange) {
      onRangeChange(range);
    }
  };

  const chartData = points.map((p) => ({
    date: p.date,
    displayTime: activeRange === '24h' ? p.timestamp.slice(11, 16) : p.date.slice(5),
    price: p.min_price_eur,
    carrier: p.carrier,
    ticks: p.ticks_count,
  }));

  const allPrices = points.map((p) => p.min_price_eur);
  const minVal = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.85) : 0;
  const maxVal = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices, p90Peak || 100) * 1.1) : 100;

  const symbol = currency === 'EUR' ? '€' : `${currency} `;

  return (
    <div className={styles.container} role="region" aria-label="Route price trend graph">
      <div className={styles.header}>
        <div>
          <span className={styles.telemetryTag} aria-hidden="true">{"// PRICE_FLUCTUATION_CURVE"}</span>
          <h4 className={styles.title}>Historical Price Trend</h4>
        </div>
        <div className={styles.rangeSelector}>
          {(['24h', '7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.rangeBtn} ${activeRange === r ? styles.activeRangeBtn : ''}`}
              onClick={() => handleRangeClick(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="priceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent-primary, #0F4C5C)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-accent-primary, #0F4C5C)" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="displayTime"
              stroke="var(--color-border, #E2E8F0)"
              tick={{ fill: 'var(--color-text-muted, #64748B)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border, #E2E8F0)' }}
            />
            <YAxis
              domain={[minVal, maxVal]}
              stroke="var(--color-border, #E2E8F0)"
              tick={{ fill: 'var(--color-text-muted, #64748B)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${symbol}${v}`}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                return (
                  <div className={styles.tooltipContainer}>
                    <span className={styles.tooltipDate}>{d.date}</span>
                    <span className={styles.tooltipPrice}>{symbol}{d.price?.toFixed(2)}</span>
                    <span className={styles.tooltipMeta}>{d.carrier} · {d.ticks} observation(s)</span>
                  </div>
                );
              }}
            />

            {p10Deal !== null && (
              <ReferenceLine
                y={p10Deal}
                stroke="var(--color-accent-teal-mid, #14788D)"
                strokeDasharray="4 4"
                label={{
                  value: `P10: €${p10Deal.toFixed(0)}`,
                  fill: 'var(--color-accent-teal-mid, #14788D)',
                  fontSize: 10,
                  position: 'insideTopRight',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
            )}

            {p50Median !== null && (
              <ReferenceLine
                y={p50Median}
                stroke="var(--color-accent-gold, #E2B33C)"
                strokeDasharray="4 4"
                label={{
                  value: `P50: €${p50Median.toFixed(0)}`,
                  fill: 'var(--color-accent-gold, #E2B33C)',
                  fontSize: 10,
                  position: 'insideTopRight',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-accent-primary, #0F4C5C)"
              strokeWidth={2}
              fill="url(#priceTrendGradient)"
              activeDot={{ r: 5, fill: 'var(--color-accent-primary, #0F4C5C)', stroke: '#FFF', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <span className={styles.legendLineSolid} />
          <span>Observed Price</span>
        </div>
        {p10Deal !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineDeal} />
            <span>P10 Target (Deal)</span>
          </div>
        )}
        {p50Median !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineMedian} />
            <span>P50 Baseline (Median)</span>
          </div>
        )}
      </div>
    </div>
  );
}
