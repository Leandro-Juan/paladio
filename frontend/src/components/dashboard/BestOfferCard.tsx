"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouteMonitoring } from '@/hooks/useRouteMonitoring';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import styles from './BestOfferCard.module.css';

export function BestOfferCard() {
  const { deals, routes, isLoading, userCurrency } = useRouteMonitoring();

  // Pick top deal package (highest discount percentage or lowest price)
  const bestDeal = useMemo(() => {
    if (deals && deals.length > 0) {
      return deals[0];
    }
    return null;
  }, [deals]);

  // Fallback: check if any route has a scanned discount even if no full package deal
  const bestDiscountRoute = useMemo(() => {
    if (bestDeal || !routes || routes.length === 0) return null;
    const candidates = routes.filter((r) => typeof r.discount_pct === 'number' && r.discount_pct > 0);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))[0];
  }, [bestDeal, routes]);

  if (isLoading) {
    return (
      <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="font-mono text-muted text-xs">{'// SCANNING CORRIDORS FOR BEST OFFER...'}</p>
      </div>
    );
  }

  if (!bestDeal && !bestDiscountRoute) {
    return (
      <div className={styles.standbyContainer}>
        <span className={styles.standbyTag}>{'// CORRIDOR TELEMETRY'}</span>
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

  if (bestDeal) {
    const activeCurrency = bestDeal.currency || userCurrency || 'EUR';
    const nightsText = `${bestDeal.nights} ${bestDeal.nights === 1 ? 'Night' : 'Nights'}`;

    return (
      <div className={styles.container}>
        <div>
          {/* Top Row: Telemetry Badge + Discount Pill */}
          <div className={styles.topRow}>
            <div className={styles.radarBadge}>
              <span className={styles.pulseDot} aria-hidden="true" />
              <span>{'// BEST SCANNED OFFER'}</span>
            </div>
            {bestDeal.discount_pct > 0 && (
              <span className={styles.discountPill}>
                {Math.round(bestDeal.discount_pct)}% OFF
              </span>
            )}
          </div>

          {/* Route Header */}
          <h3 className={styles.routeTitle}>
            <span>{bestDeal.origin_iata}</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
            <span>{bestDeal.destination_name}</span>
          </h3>

          <span className={styles.datesSubtitle}>
            {bestDeal.depart_date} → {bestDeal.return_date} · {nightsText}
          </span>

          {/* Price Box */}
          <div className={styles.priceSection}>
            <div>
              <span className={styles.priceLabel}>Verified Package</span>
              <span className={styles.currentPrice}>
                {formatCurrencyAmount(bestDeal.total_price_eur, activeCurrency)}
              </span>
              {bestDeal.baseline_median_eur > bestDeal.total_price_eur && (
                <span className={styles.benchmarkPrice}>
                  {formatCurrencyAmount(bestDeal.baseline_median_eur, activeCurrency)}
                </span>
              )}
            </div>
            {bestDeal.savings_eur > 0 && (
              <span className={styles.savingsText}>
                Save {formatCurrencyAmount(bestDeal.savings_eur, activeCurrency)}
              </span>
            )}
          </div>

          {/* Key Details Summary */}
          <div className={styles.detailsList}>
            {bestDeal.flight && (
              <div className={styles.detailRow}>
                <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                </svg>
                <span className={styles.detailText}>
                  {bestDeal.flight.airline || 'Flight Corridor'} · {bestDeal.flight.flight_number || 'Direct'}
                </span>
              </div>
            )}
            {bestDeal.lodging && (
              <div className={styles.detailRow}>
                <svg className={styles.detailIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span className={styles.detailText} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>{bestDeal.lodging.property_name || 'Verified Lodging'}</span>
                  {Boolean(bestDeal.lodging.stars) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', opacity: 0.85 }}>
                      ({bestDeal.lodging.stars}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA Action Button */}
        <Link
          href={`/monitoring?route=${bestDeal.alert_id || bestDeal.id}`}
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
  return (
    <div className={styles.container}>
      <div>
        <div className={styles.topRow}>
          <div className={styles.radarBadge}>
            <span className={styles.pulseDot} aria-hidden="true" />
            <span>{'// BEST SCANNED CORRIDOR'}</span>
          </div>
          {bestDiscountRoute?.discount_pct && bestDiscountRoute.discount_pct > 0 && (
            <span className={styles.discountPill}>
              {Math.round(bestDiscountRoute.discount_pct)}% OFF
            </span>
          )}
        </div>

        <h3 className={styles.routeTitle}>
          <span>{bestDiscountRoute?.origin_iata}</span>
          <span className={styles.arrow} aria-hidden="true">→</span>
          <span>{bestDiscountRoute?.destination_name}</span>
        </h3>

        <span className={styles.datesSubtitle}>
          {bestDiscountRoute?.earliest_date} → {bestDiscountRoute?.latest_date}
        </span>

        <div className={styles.priceSection}>
          <div>
            <span className={styles.priceLabel}>Current Corridor Price</span>
            <span className={styles.currentPrice}>
              {formatCurrencyAmount(bestDiscountRoute?.current_price_eur ?? 0, activeCurrency)}
            </span>
            {bestDiscountRoute?.baseline_p50_eur && (
              <span className={styles.benchmarkPrice}>
                {formatCurrencyAmount(bestDiscountRoute.baseline_p50_eur, activeCurrency)}
              </span>
            )}
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
