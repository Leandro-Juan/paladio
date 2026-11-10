"use client";

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouteMonitoring, DealPackage } from '@/hooks/useRouteMonitoring';
import { apiFetch } from '@/utils/api';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { ArrowRightIcon } from '@/components/icons';
import styles from './BestOfferCard.module.css';

export function BestOfferCard() {
  const { deals, routes, isLoading, userCurrency } = useRouteMonitoring();
  const [routeDeal, setRouteDeal] = useState<DealPackage | null>(null);

  // Pick top deal package (highest discount percentage or lowest price)
  const bestDeal = useMemo(() => {
    if (deals && deals.length > 0) {
      return deals[0];
    }
    return null;
  }, [deals]);

  // Fallback candidate route
  const bestDiscountRoute = useMemo(() => {
    if (bestDeal || !routes || routes.length === 0) return null;
    const candidates = routes.filter((r) => typeof r.discount_pct === 'number' && r.discount_pct > 0);
    if (candidates.length > 0) {
      return [...candidates].sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))[0];
    }
    const priced = routes.filter((r) => typeof r.current_price_eur === 'number' && r.current_price_eur > 0);
    if (priced.length > 0) {
      return [...priced].sort((a, b) => (a.current_price_eur ?? Infinity) - (b.current_price_eur ?? Infinity))[0];
    }
    return routes[0] || null;
  }, [bestDeal, routes]);

  // When no global deal package is yet alert-cached, query route-specific deals directly
  useEffect(() => {
    if (!bestDeal && bestDiscountRoute?.id) {
      apiFetch<DealPackage[]>(`/market/routes/${bestDiscountRoute.id}/deals`)
        .then((res) => {
          if (Array.isArray(res) && res.length > 0) {
            setRouteDeal(res[0]);
          }
        })
        .catch(() => {});
    }
  }, [bestDeal, bestDiscountRoute?.id]);

  const activeDeal = bestDeal || routeDeal;

  if (isLoading) {
    return (
      <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <PaladioLoader variant="card" showLogo={false} />
      </div>
    );
  }

  if (!activeDeal && !bestDiscountRoute) {
    return (
      <div className={styles.standbyContainer}>
        <span className={styles.standbyTag}>CORRIDOR TELEMETRY</span>
        <h3 className={styles.standbyTitle}>No Active Scan Offers</h3>
        <p className={styles.standbyDesc}>
          Set up corridor alerts in Route Monitoring to track autonomous flight & hotel deal scans.
        </p>
        <Link href="/monitoring" className={styles.standbyBtn}>
          + Configure Corridors
        </Link>
      </div>
    );
  }

  if (activeDeal) {
    const activeCurrency = activeDeal.currency || userCurrency || 'EUR';
    const nightsText = `${activeDeal.nights} ${activeDeal.nights === 1 ? 'Night' : 'Nights'}`;

    return (
      <div className={styles.container}>
        <div>
          {/* Top Row: Discount Pill (Clean header without glowing dot) */}
          <div className={styles.topRow}>
            {activeDeal.discount_pct > 0 && (
              <span className={styles.discountPill}>
                {Math.round(activeDeal.discount_pct)}% OFF
              </span>
            )}
          </div>

          {/* Route Header */}
          <h3 className={styles.routeTitle} title={`${activeDeal.origin_iata} to ${activeDeal.destination_name} (${activeDeal.destination_code})`}>
            <span>{activeDeal.origin_iata}</span>
            <ArrowRightIcon size={14} className={styles.arrow} aria-hidden="true" />
            <span>{activeDeal.destination_code || activeDeal.destination_name}</span>
          </h3>

          <span className={styles.datesSubtitle}>
            {activeDeal.depart_date} → {activeDeal.return_date} · {nightsText}
          </span>

          {/* Price Box */}
          <div className={styles.priceSection}>
            <div>
              <span className={styles.priceLabel}>Verified Roundtrip Package</span>
              <span className={styles.currentPrice}>
                {formatCurrencyAmount(activeDeal.total_price_eur, activeCurrency)}
              </span>
              {activeDeal.baseline_median_eur > activeDeal.total_price_eur && (
                <span className={styles.benchmarkPrice}>
                  {formatCurrencyAmount(activeDeal.baseline_median_eur, activeCurrency)}
                </span>
              )}
            </div>
            {activeDeal.savings_eur > 0 && (
              <span className={styles.savingsText}>
                Save {formatCurrencyAmount(activeDeal.savings_eur, activeCurrency)}
              </span>
            )}
          </div>

          {/* Key Details Summary: Outbound Flight + Return Flight + Best Found Hotel */}
          <div className={styles.detailsList}>
            {/* Outbound Flight */}
            {activeDeal.flight && (
              <div className={styles.detailRow}>
                <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                </svg>
                <span className={styles.detailText}>
                  <span className={styles.detailLabel}>Outbound:</span>
                  <strong>{formatCurrencyAmount(activeDeal.flight.landed_price_eur || activeDeal.flight.base_price_eur, activeCurrency)}</strong>
                  {' · '}{activeDeal.flight.airline || 'Flight'}{activeDeal.flight.flight_number ? ` · ${activeDeal.flight.flight_number}` : ''}
                </span>
              </div>
            )}

            {/* Return Flight */}
            {activeDeal.return_flight && (
              <div className={styles.detailRow}>
                <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ transform: 'rotate(180deg)' }}>
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                </svg>
                <span className={styles.detailText}>
                  <span className={styles.detailLabel}>Return:</span>
                  <strong>{formatCurrencyAmount(activeDeal.return_flight.landed_price_eur || activeDeal.return_flight.base_price_eur, activeCurrency)}</strong>
                  {' · '}{activeDeal.return_flight.airline || 'Flight'}{activeDeal.return_flight.flight_number ? ` · ${activeDeal.return_flight.flight_number}` : ''}
                </span>
              </div>
            )}

            {/* Best Found Hotel */}
            {activeDeal.lodging && (
              <div className={styles.detailRow}>
                <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span className={styles.detailText}>
                  <span className={styles.detailLabel}>Best Hotel:</span>
                  <strong title={activeDeal.lodging.property_name || 'Verified Hotel'}>{activeDeal.lodging.property_name || 'Verified Hotel'}</strong>
                  {Boolean(activeDeal.lodging.stars) && (
                    <span style={{ opacity: 0.85, marginLeft: '3px' }}>
                      ({activeDeal.lodging.stars}★)
                    </span>
                  )}
                  {Boolean(activeDeal.lodging.review_score && !activeDeal.lodging.stars) && (
                    <span style={{ opacity: 0.85, marginLeft: '3px' }}>
                      (★ {activeDeal.lodging.review_score})
                    </span>
                  )}
                  {activeDeal.lodging.nightly_base_eur > 0 && (
                    <span style={{ opacity: 0.85, marginLeft: '4px' }}>
                      · {formatCurrencyAmount(activeDeal.lodging.nightly_base_eur, activeCurrency)}/nt
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA Action Button */}
        <Link
          href={`/monitoring?route=${activeDeal.alert_id || activeDeal.id}`}
          className={styles.actionButton}
        >
          <span>Inspect Corridor Offer</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    );
  }

  // Fallback discounted route
  const activeCurrency = bestDiscountRoute?.currency || userCurrency || 'EUR';
  const routeSavings =
    bestDiscountRoute?.baseline_p50_eur &&
    bestDiscountRoute?.current_price_eur &&
    bestDiscountRoute.baseline_p50_eur > bestDiscountRoute.current_price_eur
      ? bestDiscountRoute.baseline_p50_eur - bestDiscountRoute.current_price_eur
      : 0;

  const nightsRange =
    bestDiscountRoute?.min_nights && bestDiscountRoute?.max_nights
      ? ` · ${bestDiscountRoute.min_nights}-${bestDiscountRoute.max_nights} Nights`
      : '';

  return (
    <div className={styles.container}>
      <div>
        <div className={styles.topRow}>
          {bestDiscountRoute?.discount_pct && bestDiscountRoute.discount_pct > 0 ? (
            <span className={styles.discountPill}>
              {Math.round(bestDiscountRoute.discount_pct)}% OFF
            </span>
          ) : bestDiscountRoute?.verdict ? (
            <span className={styles.discountPill}>
              {bestDiscountRoute.verdict} VALUE
            </span>
          ) : null}
        </div>

        <h3 className={styles.routeTitle} title={bestDiscountRoute?.destination_name ? `${bestDiscountRoute.origin_iata} to ${bestDiscountRoute.destination_name} (${bestDiscountRoute.destination_code})` : undefined}>
          <span>{bestDiscountRoute?.origin_iata}</span>
          <ArrowRightIcon size={14} className={styles.arrow} aria-hidden="true" />
          <span>{bestDiscountRoute?.destination_code || bestDiscountRoute?.destination_name}</span>
        </h3>

        <span className={styles.datesSubtitle}>
          {bestDiscountRoute?.earliest_date} → {bestDiscountRoute?.latest_date}{nightsRange}
        </span>

        <div className={styles.priceSection}>
          <div>
            <span className={styles.priceLabel}>Outbound Flight From</span>
            <span className={styles.currentPrice}>
              {formatCurrencyAmount(bestDiscountRoute?.current_price_eur ?? 0, activeCurrency)}
            </span>
            {bestDiscountRoute?.baseline_p50_eur && (
              <span className={styles.benchmarkPrice}>
                {formatCurrencyAmount(bestDiscountRoute.baseline_p50_eur, activeCurrency)}
              </span>
            )}
          </div>
          {routeSavings > 0 && (
            <span className={styles.savingsText}>
              Save {formatCurrencyAmount(routeSavings, activeCurrency)}
            </span>
          )}
        </div>

        <div className={styles.detailsList}>
          <div className={styles.detailRow}>
            <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
            </svg>
            <span className={styles.detailText}>
              <span className={styles.detailLabel}>Outbound:</span>
              <strong>{formatCurrencyAmount(bestDiscountRoute?.current_price_eur ?? 0, activeCurrency)}</strong>
              {' · '}{bestDiscountRoute?.destination_code ? `${bestDiscountRoute.destination_code} Corridor` : 'Direct Route'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
            <span className={styles.detailText}>
              <span className={styles.detailLabel}>Telemetry:</span>
              {bestDiscountRoute?.ticks_count ? `${bestDiscountRoute.ticks_count} scans recorded` : 'Monitored corridor'}
              {bestDiscountRoute?.verdict ? ` · ${bestDiscountRoute.verdict} verdict` : ''}
            </span>
          </div>
        </div>
      </div>

      <Link
        href={`/monitoring?route=${bestDiscountRoute?.id}`}
        className={styles.actionButton}
      >
        <span>Inspect Corridor Offer</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </div>
  );
}
