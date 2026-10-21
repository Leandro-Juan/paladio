"use client";

import React, { useState, useMemo } from 'react';
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
  p50Median,
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

  // Quantiles handling: when in forward curve (Calendar Horizon) view, use forward curve quantiles
  // so the percentiles and median strictly match the displayed 11-month calendar curve and corpus banner.
  const forwardPrices = useMemo(() => {
    return forwardCurve
      .map((f) => f.price_eur)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p))
      .sort((a, b) => a - b);
  }, [forwardCurve]);

  const activeP10 = useMemo(() => {
    if (isForward && forwardPrices.length > 0) {
      const idx = Math.floor(forwardPrices.length * 0.1);
      return forwardPrices[idx];
    }
    return p10Deal;
  }, [isForward, forwardPrices, p10Deal]);

  const activeP50 = useMemo(() => {
    if (isForward) {
      if (corpus?.median_price_eur !== null && corpus?.median_price_eur !== undefined) {
        return corpus.median_price_eur;
      }
      if (forwardPrices.length > 0) {
        const mid = Math.floor(forwardPrices.length / 2);
        return forwardPrices.length % 2 === 0
          ? (forwardPrices[mid - 1] + forwardPrices[mid]) / 2
          : forwardPrices[mid];
      }
    }
    return p50Median;
  }, [isForward, corpus, forwardPrices, p50Median]);

  const activeP90 = useMemo(() => {
    if (isForward && forwardPrices.length > 0) {
      const idx = Math.floor(forwardPrices.length * 0.9);
      return forwardPrices[idx];
    }
    return p90Peak;
  }, [isForward, forwardPrices, p90Peak]);

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
  const maxVal = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices, activeP90 || 100) * 1.1) : 100;

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
      <div key={`${activeView}-${activeRange}`} className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="priceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.55} />
                <stop offset="35%" stopColor="#3B82F6" stopOpacity={0.30} />
                <stop offset="70%" stopColor="#60A5FA" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#93C5FD" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #E2D9CC)" opacity={0.6} />

            <XAxis
              dataKey="displayTime"
              stroke="var(--color-border, #E2D9CC)"
              tick={{ fill: 'var(--color-text-muted, #566B76)', fontSize: 11, fontFamily: 'var(--font-code, monospace)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border, #E2D9CC)' }}
              minTickGap={45}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minVal, maxVal]}
              width={45}
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

            {activeP90 !== null && (
              <ReferenceLine
                y={activeP90}
                stroke="#EF4444"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}

            {activeP50 !== null && (
              <ReferenceLine
                y={activeP50}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}

            {activeP10 !== null && (
              <ReferenceLine
                y={activeP10}
                stroke="#10B981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}

            <Area
              type="monotone"
              dataKey="price"
              stroke="#2563EB"
              strokeWidth={2.5}
              fill="url(#priceTrendGradient)"
              isAnimationActive={false}
              activeDot={{ r: 5, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <span className={styles.legendLineSolid} style={{ backgroundColor: '#2563EB' }} />
          <span>{isForward ? 'Calendar Fare' : 'Observed Fare'}</span>
        </div>
        {activeP10 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineDeal} style={{ backgroundColor: '#10B981' }} />
            <span>P10 Deal Target ({symbol}{activeP10.toFixed(0)})</span>
          </div>
        )}
        {activeP50 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineMedian} style={{ backgroundColor: '#F59E0B' }} />
            <span>P50 Median ({symbol}{activeP50.toFixed(0)})</span>
          </div>
        )}
        {activeP90 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLinePeak} style={{ backgroundColor: '#EF4444' }} />
            <span>P90 Peak Ceiling ({symbol}{activeP90.toFixed(0)})</span>
          </div>
        )}
      </div>
    </div>
  );
}
