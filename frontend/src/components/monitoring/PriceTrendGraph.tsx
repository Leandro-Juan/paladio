"use client";

import React, { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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
  earliestDate?: string | null;
  latestDate?: string | null;
  minNights?: number | null;
  maxNights?: number | null;
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
  earliestDate,
  latestDate,
  minNights,
  maxNights,
}: PriceTrendGraphProps) {
  const { t } = useTranslation();
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
        displayTime: f.depart_date ? f.depart_date.slice(5) : '', // MM-DD
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

  const earliestDisplayTime = useMemo(() => {
    if (!earliestDate) return null;
    const match = chartData.find((d) => d.date === earliestDate);
    return match ? match.displayTime : null;
  }, [chartData, earliestDate]);

  const latestDisplayTime = useMemo(() => {
    if (!latestDate) return null;
    const match = chartData.find((d) => d.date === latestDate);
    return match ? match.displayTime : null;
  }, [chartData, latestDate]);

  const returnHorizonDateStr = useMemo(() => {
    if (!latestDate) return null;
    try {
      const d = new Date(latestDate);
      d.setDate(d.getDate() + (maxNights || 7));
      return d.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }, [latestDate, maxNights]);

  const returnHorizonDisplayTime = useMemo(() => {
    if (!returnHorizonDateStr) return null;
    const match = chartData.find((d) => d.date === returnHorizonDateStr);
    return match ? match.displayTime : null;
  }, [chartData, returnHorizonDateStr]);

  const isNearRightEdge = (displayTime: string | null) => {
    if (!displayTime || chartData.length === 0) return false;
    const idx = chartData.findIndex((d) => d.displayTime === displayTime);
    return idx >= 0 && idx > chartData.length * 0.8;
  };

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
              <span style={{ color: '#0284C7', fontWeight: 600 }}>{t('monitoring.outbound_colon_upper')}</span>
              <span className={styles.tooltipVal}>{symbol}{d.outboundPrice.toFixed(2)}</span>
            </div>
          )}
          {d.returnPrice !== null && (
            <div className={styles.tooltipRow}>
              <span style={{ color: '#D97706', fontWeight: 600 }}>{t('monitoring.return_colon_upper')}</span>
              <span className={styles.tooltipVal}>{symbol}{d.returnPrice.toFixed(2)}</span>
            </div>
          )}
          {d.flightTotal !== null && d.returnPrice !== null && (
            <div className={styles.tooltipRowTotal}>
              <span>{t('monitoring.total_airfare_colon')}</span>
              <span>{symbol}{d.flightTotal.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.tooltipCarrierText}>
            {t('monitoring.carrier_line', { carrier: d.carrier })}
            {d.returnCarrier ? t('monitoring.ret_carrier_inline', { carrier: d.returnCarrier }) : ''}
          </div>
        </div>

        {/* Lodging Telemetry */}
        {d.nightlyPrice !== null && (
          <div className={styles.tooltipLodgingSection}>
            <div className={styles.tooltipRow}>
              <span style={{ color: 'var(--color-accent-teal-mid, #0F4C5C)', fontWeight: 600 }}>{t('monitoring.hotel_rate_colon')}</span>
              <span className={styles.tooltipVal}>
                {t('monitoring.price_per_night_compact', { price: `${symbol}${d.nightlyPrice.toFixed(2)}` })}
              </span>
            </div>
            {d.propertyName && (
              <div className={styles.tooltipHotelName}>
                {d.propertyName} {d.reviewScore ? `(★ ${d.reviewScore.toFixed(1)})` : ''}
              </div>
            )}
            {d.nProperties > 1 && (
              <div className={styles.tooltipCarrierText} style={{ marginTop: '2px', color: 'var(--color-accent-teal-mid, #0F4C5C)' }}>
                {t('monitoring.verified_properties_scanned', { count: d.nProperties })}
              </div>
            )}
            {d.totalStayPrice !== null && (
              <div className={styles.tooltipRowSub}>
                <span>{t('monitoring.est_stay_total')}</span>
                <span>{symbol}{d.totalStayPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Combined Package Total */}
        {d.packagePrice !== null && (
          <div className={styles.tooltipPackageRow}>
            <span>{t('monitoring.landed_package_colon')}</span>
            <span className={styles.tooltipPackagePrice}>{symbol}{d.packagePrice.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container} role="region" aria-label={t('monitoring.price_trend_graph_aria')}>
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h4 className={styles.title}>
              {t('monitoring.calendar_horizon_spread')}
            </h4>
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
                {dir === 'both'
                  ? t('monitoring.dir_both_upper')
                  : dir === 'outbound'
                  ? t('monitoring.dir_outbound_upper')
                  : t('monitoring.dir_return_upper')}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* Chart 1: Flight Fares */}
      <div className={styles.chartWrapper}>
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

            {/* User Target Travel Window & Return Horizon */}
            {earliestDisplayTime && latestDisplayTime && (
              <ReferenceArea
                x1={earliestDisplayTime}
                x2={latestDisplayTime}
                fill="#0284C7"
                fillOpacity={0.08}
                stroke="#0284C7"
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
            )}
            {earliestDisplayTime && (
              <ReferenceLine
                x={earliestDisplayTime}
                stroke="#0284C7"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: t('monitoring.earliest_dep_short'),
                  position: isNearRightEdge(earliestDisplayTime) ? 'insideTopRight' : 'insideTopLeft',
                  fill: '#0284C7',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  dx: isNearRightEdge(earliestDisplayTime) ? -4 : 4,
                  dy: 4,
                }}
              />
            )}
            {latestDisplayTime && (
              <ReferenceLine
                x={latestDisplayTime}
                stroke="#0284C7"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: t('monitoring.latest_dep_short'),
                  position: isNearRightEdge(latestDisplayTime) ? 'insideTopRight' : 'insideTopLeft',
                  fill: '#0284C7',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  dx: isNearRightEdge(latestDisplayTime) ? -4 : 4,
                  dy: 18,
                }}
              />
            )}
            {returnHorizonDisplayTime && (
              <ReferenceLine
                x={returnHorizonDisplayTime}
                stroke="#D97706"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: t('monitoring.max_return_nights', { nights: maxNights || 7 }),
                  position: isNearRightEdge(returnHorizonDisplayTime) ? 'insideTopRight' : 'insideTopLeft',
                  fill: '#D97706',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  dx: isNearRightEdge(returnHorizonDisplayTime) ? -4 : 4,
                  dy: 32,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="outboundPrice"
              name={t('monitoring.outbound_label')}
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
              name={t('monitoring.return_label')}
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
          <span>{t('monitoring.outbound_airfare')}</span>
        </div>
        <div className={styles.legendItem} style={{ opacity: directionView === 'outbound' ? 0.35 : 1 }}>
          <span className={styles.legendLineSolid} style={{ backgroundColor: '#D97706' }} />
          <span>{t('monitoring.return_airfare')}</span>
        </div>
        {activeP10 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineDeal} style={{ backgroundColor: '#10B981' }} />
            <span>{t('monitoring.p10_deal_target', { price: `${symbol}${activeP10.toFixed(0)}` })}</span>
          </div>
        )}
        {activeP50 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLineMedian} style={{ backgroundColor: '#F59E0B' }} />
            <span>{t('monitoring.p50_median_legend', { price: `${symbol}${activeP50.toFixed(0)}` })}</span>
          </div>
        )}
        {activeP90 !== null && (
          <div className={styles.legendItem}>
            <span className={styles.legendLinePeak} style={{ backgroundColor: '#EF4444' }} />
            <span>{t('monitoring.p90_peak_ceiling', { price: `${symbol}${activeP90.toFixed(0)}` })}</span>
          </div>
        )}
        {earliestDate && latestDate && (
          <div className={styles.legendItem}>
            <span style={{ width: '12px', height: '10px', background: 'rgba(2, 132, 199, 0.25)', border: '1px dashed #0284C7', borderRadius: '2px', display: 'inline-block' }} />
            <span>{t('monitoring.target_window_legend', { start: earliestDate.slice(5), end: latestDate.slice(5) })}</span>
          </div>
        )}
        {returnHorizonDateStr && (
          <div className={styles.legendItem}>
            <span style={{ width: '12px', height: '2px', background: '#D97706', display: 'inline-block', borderTop: '2px dashed #D97706' }} />
            <span>{t('monitoring.max_stay_limit', { nights: maxNights || 7 })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
