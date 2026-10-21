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
  LodgingPricePoint,
  CorpusInfo,
  PriceVerdictInfo,
} from '@/hooks/useRouteMonitoring';
import { VerdictBadge } from './VerdictBadge';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import styles from './PriceTrendGraph.module.css';

interface PriceTrendGraphProps {
  points?: HistoryPoint[];
  returnPoints?: HistoryPoint[];
  forwardCurve?: ForwardPricePoint[];
  lodgingCurve?: LodgingPricePoint[];
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

interface ChartDataItem {
  date: string;
  displayTime: string;
  // Flight fields
  outboundPrice: number | null;
  returnPrice: number | null;
  flightTotal: number | null;
  carrier: string;
  returnCarrier: string | null;
  verdict: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | null;
  percentile: number | null;
  // Lodging fields
  nightlyPrice: number | null;
  totalStayPrice: number | null;
  propertyName: string | null;
  stars: number | null;
  reviewScore: number | null;
  bookingUrl: string | null;
  nProperties: number;
  // Package Total
  packagePrice: number | null;
}

export function PriceTrendGraph({
  forwardCurve = [],
  lodgingCurve = [],
  p10Deal,
  p50Median,
  p90Peak,
  verdict,
  corpus,
  currency = 'EUR',
  isScanning = false,
  isBackfilling = false,
  onTriggerBackfill,
}: PriceTrendGraphProps) {
  const isBusy = isBackfilling || isScanning;
  const [directionView, setDirectionView] = useState<'both' | 'outbound' | 'return'>('both');

  const symbol = getCurrencyInfo(currency).symbol;

  // Map lodging by departure date
  const lodgingByDate = useMemo(() => {
    const map = new Map<string, LodgingPricePoint>();
    for (const lp of lodgingCurve) {
      map.set(lp.date, lp);
    }
    return map;
  }, [lodgingCurve]);

  // Quantiles calculated from forward calendar sweep
  const forwardPrices = useMemo(() => {
    return forwardCurve
      .map((f) => f.price_eur)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p))
      .sort((a, b) => a - b);
  }, [forwardCurve]);

  const activeP10 = useMemo(() => {
    if (forwardPrices.length > 0) {
      const idx = Math.floor(forwardPrices.length * 0.1);
      return forwardPrices[idx];
    }
    return p10Deal;
  }, [forwardPrices, p10Deal]);

  const activeP50 = useMemo(() => {
    if (corpus?.median_price_eur !== null && corpus?.median_price_eur !== undefined) {
      return corpus.median_price_eur;
    }
    if (forwardPrices.length > 0) {
      const mid = Math.floor(forwardPrices.length / 2);
      return forwardPrices.length % 2 === 0
        ? (forwardPrices[mid - 1] + forwardPrices[mid]) / 2
        : forwardPrices[mid];
    }
    return p50Median;
  }, [corpus, forwardPrices, p50Median]);

  const activeP90 = useMemo(() => {
    if (forwardPrices.length > 0) {
      const idx = Math.floor(forwardPrices.length * 0.9);
      return forwardPrices[idx];
    }
    return p90Peak;
  }, [forwardPrices, p90Peak]);

  // Unified chart data combining forward flight curve and dynamic lodging benchmarks
  const chartData: ChartDataItem[] = useMemo(() => {
    return forwardCurve.map((f): ChartDataItem => {
      const lodging = lodgingByDate.get(f.depart_date);
      const outbound = typeof f.price_eur === 'number' && !isNaN(f.price_eur) ? f.price_eur : null;
      const ret = typeof f.price_return_eur === 'number' && !isNaN(f.price_return_eur) ? f.price_return_eur : null;
      const flightTotal = outbound !== null ? (outbound + (ret ?? 0)) : null;

      const nightly = lodging && typeof lodging.nightly_price_eur === 'number' ? lodging.nightly_price_eur : null;
      const totalStay = lodging && typeof lodging.total_stay_eur === 'number' ? lodging.total_stay_eur : null;
      const packagePrice = flightTotal !== null && totalStay !== null ? flightTotal + totalStay : null;

      return {
        date: f.depart_date,
        displayTime: f.depart_date.slice(5), // MM-DD
        outboundPrice: outbound,
        returnPrice: ret,
        flightTotal,
        carrier: f.carrier || 'Ryanair',
        returnCarrier: f.return_carrier || null,
        verdict: f.verdict ?? null,
        percentile: f.percentile ?? null,
        nightlyPrice: nightly,
        totalStayPrice: totalStay,
        propertyName: lodging?.property_name ?? null,
        stars: lodging?.stars ?? null,
        reviewScore: lodging?.review_score ?? null,
        bookingUrl: lodging?.booking_url ?? null,
        nProperties: lodging?.n_properties ?? (nightly !== null ? 1 : 0),
        packagePrice,
      };
    });
  }, [forwardCurve, lodgingByDate]);

  // Price range for Flight Chart
  const flightPrices = useMemo(() => {
    const list: number[] = [];
    chartData.forEach((d) => {
      if (typeof d.outboundPrice === 'number' && !isNaN(d.outboundPrice)) list.push(d.outboundPrice);
      if (typeof d.returnPrice === 'number' && !isNaN(d.returnPrice)) list.push(d.returnPrice);
    });
    return list;
  }, [chartData]);

  const minFlightVal = flightPrices.length > 0 ? Math.floor(Math.min(...flightPrices) * 0.85) : 0;
  const maxFlightVal = flightPrices.length > 0 ? Math.ceil(Math.max(...flightPrices, activeP90 || 100) * 1.1) : 100;

  // Shared tooltip renderer for synchronized scrubber
  const renderSharedTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d: ChartDataItem = payload[0].payload;
    return (
      <div className={styles.tooltipContainer}>
        <div className={styles.tooltipHeader}>
          <span className={styles.tooltipDate}>{d.date}</span>
          {d.verdict && (
            <VerdictBadge
              verdict={d.verdict}
              percentile={d.percentile}
              size="sm"
            />
          )}
        </div>

        {/* Flight Telemetry */}
        <div className={styles.tooltipSection}>
          {d.outboundPrice !== null && (
            <div className={styles.tooltipRow}>
              <span style={{ color: '#0284C7', fontWeight: 600 }}>OUTBOUND:</span>
              <span className={styles.tooltipVal}>{symbol}{d.outboundPrice.toFixed(2)}</span>
            </div>
          )}
          {d.returnPrice !== null && (
            <div className={styles.tooltipRow}>
              <span style={{ color: '#D97706', fontWeight: 600 }}>RETURN:</span>
              <span className={styles.tooltipVal}>{symbol}{d.returnPrice.toFixed(2)}</span>
            </div>
          )}
          {d.flightTotal !== null && d.returnPrice !== null && (
            <div className={styles.tooltipRowTotal}>
              <span>TOTAL AIRFARE:</span>
              <span>{symbol}{d.flightTotal.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.tooltipCarrierText}>
            Carrier: {d.carrier}{d.returnCarrier ? ` · Ret: ${d.returnCarrier}` : ''}
          </div>
        </div>

        {/* Lodging Telemetry */}
        {d.nightlyPrice !== null && (
          <div className={styles.tooltipLodgingSection}>
            <div className={styles.tooltipRow}>
              <span style={{ color: '#0F4C5C', fontWeight: 600 }}>HOTEL RATE:</span>
              <span className={styles.tooltipVal}>{symbol}{d.nightlyPrice.toFixed(2)}/night</span>
            </div>
            {d.propertyName && (
              <div className={styles.tooltipHotelName} title={d.propertyName}>
                {d.propertyName} {d.reviewScore ? `(★ ${d.reviewScore.toFixed(1)})` : ''}
              </div>
            )}
            {d.nProperties > 1 && (
              <div className={styles.tooltipCarrierText} style={{ marginTop: '2px', color: '#0F4C5C' }}>
                {d.nProperties} verified properties scanned
              </div>
            )}
            {d.totalStayPrice !== null && (
              <div className={styles.tooltipRowSub}>
                <span>Est. Stay Total:</span>
                <span>{symbol}{d.totalStayPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Combined Package Total */}
        {d.packagePrice !== null && (
          <div className={styles.tooltipPackageRow}>
            <span>LANDED PACKAGE:</span>
            <span className={styles.tooltipPackagePrice}>{symbol}{d.packagePrice.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container} role="region" aria-label="Route price trend graph">
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.telemetryTag} aria-hidden="true">
            {"// 11_MONTH_CALENDAR_SWEEP"}
          </span>
          <div className={styles.titleRow}>
            <h4 className={styles.title}>
              Calendar Horizon Price Spread
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
          {/* Direction Toggle: Both vs Outbound vs Return */}
          <div className={styles.viewSelector}>
            {(['both', 'outbound', 'return'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className={`${styles.viewBtn} ${directionView === dir ? styles.activeViewBtn : ''}`}
                onClick={() => setDirectionView(dir)}
              >
                {dir.toUpperCase()}
              </button>
            ))}
          </div>
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

      {/* Chart 1: Flight Fares */}
      <div className={styles.chartWrapper}>
        <div className={styles.subChartLabelRow}>
          <span className={styles.subChartFlightTag}>AIRFARE CORRIDOR (OUTBOUND / RETURN)</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart syncId="paladioPriceSync" data={chartData} margin={{ top: 12, right: 20, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="outboundTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284C7" stopOpacity={0.45} />
                <stop offset="40%" stopColor="#0284C7" stopOpacity={0.20} />
                <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="returnTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D97706" stopOpacity={0.45} />
                <stop offset="40%" stopColor="#D97706" stopOpacity={0.20} />
                <stop offset="100%" stopColor="#D97706" stopOpacity={0.02} />
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
              domain={[minFlightVal, maxFlightVal]}
              width={50}
              stroke="var(--color-border, #E2D9CC)"
              tick={{ fill: 'var(--color-text-muted, #566B76)', fontSize: 11, fontFamily: 'var(--font-code, monospace)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${symbol}${v}`}
            />

            <Tooltip content={renderSharedTooltip} />

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
                stroke="#64748B"
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
              dataKey="outboundPrice"
              name="Outbound"
              stroke="#0284C7"
              strokeOpacity={directionView === 'return' ? 0.2 : 1}
              strokeWidth={directionView === 'outbound' ? 2.5 : 2}
              strokeDasharray={directionView === 'return' ? '3 3' : undefined}
              fill={directionView === 'return' ? 'none' : 'url(#outboundTrendGradient)'}
              isAnimationActive={false}
              activeDot={directionView === 'return' ? false : { r: 5, fill: '#0284C7', stroke: '#FFFFFF', strokeWidth: 2 }}
            />

            <Area
              type="monotone"
              dataKey="returnPrice"
              name="Return"
              stroke="#D97706"
              strokeOpacity={directionView === 'outbound' ? 0.2 : 1}
              strokeWidth={directionView === 'return' ? 2.5 : 2}
              strokeDasharray={directionView === 'outbound' ? '3 3' : undefined}
              fill={directionView === 'outbound' ? 'none' : 'url(#returnTrendGradient)'}
              isAnimationActive={false}
              activeDot={directionView === 'outbound' ? false : { r: 5, fill: '#D97706', stroke: '#FFFFFF', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Synchronized Legend */}
      <div className={styles.legendRow}>
        <div className={styles.legendItem} style={{ opacity: directionView === 'return' ? 0.35 : 1 }}>
          <span className={styles.legendLineSolid} style={{ backgroundColor: '#0284C7' }} />
          <span>Outbound Airfare</span>
        </div>
        <div className={styles.legendItem} style={{ opacity: directionView === 'outbound' ? 0.35 : 1 }}>
          <span className={styles.legendLineSolid} style={{ backgroundColor: '#D97706' }} />
          <span>Return Airfare</span>
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
