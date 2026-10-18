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
  CartesianGrid,
} from 'recharts';
import {
  HistoryPoint,
  ForwardPricePoint,
  CorpusInfo,
  PriceVerdictInfo,
} from '@/hooks/useRouteMonitoring';
import { VerdictBadge } from './VerdictBadge';
import styles from './PriceTrendGraph.module.css';

interface PriceTrendGraphProps {
  points: HistoryPoint[];
  forwardCurve?: ForwardPricePoint[];
  p10Deal: number | null;
  p25Deal?: number | null;
  p50Median: number | null;
  p75Peak?: number | null;
  p90Peak: number | null;
  verdict?: PriceVerdictInfo | null;
  corpus?: CorpusInfo | null;
  currency?: string;
  isScanning?: boolean;
  isBackfilling?: boolean;
  onRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
  onTriggerBackfill?: () => void;
}

export function PriceTrendGraph({
  points,
  forwardCurve = [],
  p10Deal,
  p25Deal,
  p50Median,
  p75Peak,
  p90Peak,
  verdict,
  corpus,
  currency = 'EUR',
  isScanning = false,
  isBackfilling = false,
  onRangeChange,
  onTriggerBackfill,
}: PriceTrendGraphProps) {
  const isBusy = isBackfilling || isScanning;
  // If there are few observation points over time but rich forward departure dates, default to forward curve
  const [activeView, setActiveView] = useState<'over_time' | 'forward_curve'>(
    points.length <= 2 && forwardCurve.length > 0 ? 'forward_curve' : 'over_time'
  );
  const [activeRange, setActiveRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');

  const handleRangeClick = (range: '24h' | '7d' | '30d' | '90d') => {
    setActiveRange(range);
    if (onRangeChange) {
      onRangeChange(range);
    }
  };

  const symbol = currency === 'EUR' ? '€' : `${currency} `;

  // Prepare chart data based on active view
  const isForward = activeView === 'forward_curve';

  const chartData = isForward
    ? forwardCurve.map((f) => ({
        date: f.depart_date,
        displayTime: f.depart_date.slice(5), // MM-DD
        price: f.price_eur,
        carrier: f.carrier || 'Ryanair',
        verdict: f.verdict,
        percentile: f.percentile,
        ticks: 1,
      }))
    : points.map((p) => ({
        date: p.date,
        displayTime: activeRange === '24h' ? p.timestamp.slice(11, 16) : p.date.slice(5),
        price: p.min_price_eur,
        carrier: p.carrier,
        verdict: null,
        percentile: null,
        ticks: p.ticks_count,
      }));

  const allPrices = (isForward ? forwardCurve.map((f) => f.price_eur) : points.map((p) => p.min_price_eur)).filter(
    (p) => typeof p === 'number' && !isNaN(p)
  );

  const minVal = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.85) : 0;
  const maxVal = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices, p90Peak || 100) * 1.1) : 100;

  return (
    <div className={styles.container} role="region" aria-label="Route price trend graph">
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.telemetryTag} aria-hidden="true">
            {isForward ? '// FORWARD_CALENDAR_SWEEP' : '// HISTORICAL_PRICE_TRAJECTORY'}
          </span>
          <div className={styles.titleRow}>
            <h4 className={styles.title}>
              {isForward ? 'Calendar Horizon Price Spread' : 'Historical Price Trajectory'}
            </h4>
            {verdict && (
              <VerdictBadge
                verdict={verdict.verdict}
                percentile={verdict.percentile}
                confidence={verdict.confidence}
                showConfidence={true}
                size="sm"
              />
            )}
          </div>
        </div>

        <div className={styles.controlsArea}>
          {/* View Toggle: Over Time vs Calendar Horizon */}
          <div className={styles.viewSelector}>
            <button
              type="button"
              className={`${styles.viewBtn} ${activeView === 'over_time' ? styles.activeViewBtn : ''}`}
              onClick={() => setActiveView('over_time')}
            >
              Over Time
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${activeView === 'forward_curve' ? styles.activeViewBtn : ''}`}
              onClick={() => setActiveView('forward_curve')}
            >
              Calendar Horizon ({forwardCurve.length})
            </button>
          </div>

          {/* Time Range Selector (only for Over Time view) */}
          {activeView === 'over_time' && (
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
          )}
        </div>
      </div>

      {/* Corpus Health & Sweep Status Banner */}
      {corpus && (
        <div className={styles.corpusBanner}>
          <div className={styles.corpusStats}>
            <span>
              Corpus: <strong className={styles.corpusPill}>{corpus.depart_dates_count} dates indexed</strong> across 11 months
            </span>
            <span>•</span>
            <span>Confidence: <strong style={{ textTransform: 'capitalize' }}>{corpus.confidence}</strong></span>
            {corpus.min_price_eur !== null && (
              <>
                <span>•</span>
                <span>Low: <strong>{symbol}{corpus.min_price_eur?.toFixed(2)}</strong></span>
              </>
            )}
            {corpus.median_price_eur !== null && (
              <>
                <span>•</span>
                <span>Median: <strong>{symbol}{corpus.median_price_eur?.toFixed(2)}</strong></span>
              </>
            )}
          </div>
          {onTriggerBackfill && (
            <button
              type="button"
              className={styles.sweepBtn}
              onClick={onTriggerBackfill}
              disabled={isBusy}
              title="Queries Ryanair fare finder across the next 11 months to refresh market baselines"
            >
              {isBusy ? 'Sweeping...' : 'Re-Sweep Calendar'}
            </button>
          )}
        </div>
      )}

      {/* Chart */}
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="priceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0F4C5C" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#0F4C5C" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #E2D9CC)" opacity={0.6} />

            <XAxis
              dataKey="displayTime"
              stroke="var(--color-border, #E2D9CC)"
              tick={{ fill: 'var(--color-text-muted, #566B76)', fontSize: 11, fontFamily: 'var(--font-code, monospace)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border, #E2D9CC)' }}
            />
            <YAxis
              domain={[minVal, maxVal]}
              stroke="var(--color-border, #E2D9CC)"
              tick={{ fill: 'var(--color-text-muted, #566B76)', fontSize: 11, fontFamily: 'var(--font-code, monospace)' }}
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
                    <span className={styles.tooltipPrice}>
                      {symbol}{typeof d.price === 'number' ? d.price.toFixed(2) : d.price}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={styles.tooltipMeta}>{d.carrier}</span>
                      {d.verdict && (
                        <VerdictBadge
                          verdict={d.verdict}
                          percentile={d.percentile}
                          size="sm"
                        />
                      )}
                    </div>
                  </div>
                );
              }}
            />

            {p90Peak !== null && (
              <ReferenceLine
                y={p90Peak}
                stroke="#B3261E"
                strokeDasharray="4 4"
                label={{
                  value: `P90 Peak: ${symbol}${p90Peak.toFixed(0)}`,
                  fill: '#B3261E',
                  fontSize: 10,
                  position: 'insideTopRight',
                  fontFamily: 'var(--font-code, monospace)',
                }}
              />
            )}

            {p50Median !== null && (
              <ReferenceLine
                y={p50Median}
                stroke="var(--color-text-muted, #566B76)"
                strokeDasharray="2 4"
                label={{
                  value: `P50 Median: ${symbol}${p50Median.toFixed(0)}`,
                  fill: 'var(--color-text-muted, #566B76)',
                  fontSize: 10,
                  position: 'insideRight',
                  fontFamily: 'var(--font-code, monospace)',
                }}
              />
            )}

            {p10Deal !== null && (
              <ReferenceLine
                y={p10Deal}
                stroke="#1F7A4D"
                strokeDasharray="4 4"
                label={{
                  value: `P10 Deal: ${symbol}${p10Deal.toFixed(0)}`,
                  fill: '#1F7A4D',
                  fontSize: 10,
                  position: 'insideBottomRight',
                  fontFamily: 'var(--font-code, monospace)',
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="price"
              stroke="#0F4C5C"
              strokeWidth={2.5}
              fill="url(#priceTrendGradient)"
              activeDot={{ r: 5, fill: '#0F4C5C', stroke: '#FAF6F0', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <span className={styles.legendLineSolid} />
          <span>{isForward ? 'Calendar Fare' : 'Observed Fare'}</span>
        </div>
        {p10Deal !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineDeal} />
            <span>P10 Deal Target</span>
          </div>
        )}
        {p50Median !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineMedian} />
            <span>P50 Median</span>
          </div>
        )}
        {p90Peak !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLinePeak} />
            <span>P90 Peak Ceiling</span>
          </div>
        )}
      </div>
    </div>
  );
}
