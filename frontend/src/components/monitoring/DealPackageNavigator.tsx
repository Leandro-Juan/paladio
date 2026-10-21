"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DealPackage } from '@/hooks/useRouteMonitoring';
import { TrendingDownIcon } from '@/components/icons';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import styles from './DealPackageNavigator.module.css';

interface DealPackageNavigatorProps {
  deals: DealPackage[];
  currency?: string;
  onDiscardDeal?: (id: string) => Promise<void> | void;
}

export function DealPackageNavigator({ deals, currency, onDiscardDeal }: DealPackageNavigatorProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  if (!deals || deals.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, currentIndex), deals.length - 1);
  const deal = deals[safeIndex];
  const activeCurrency = deal?.currency || currency || 'EUR';

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(deals.length - 1, prev + 1));
  };

  const handleMakeTrip = () => {
    router.push(
      `/engine?destination=${encodeURIComponent(deal.destination_name)}&origin=${encodeURIComponent(
        deal.origin_name
      )}&start_date=${deal.depart_date}&end_date=${deal.return_date}&budget=${deal.total_price_eur}`
    );
  };

  return (
    <section className={styles.container} aria-label="Top verified deal packages navigator">
      {/* Navigator Top Control Header */}
      <div className={styles.navTopBar}>
        <div className={styles.badgeGroup}>
          <span className={styles.radarTag} aria-hidden="true">
            <span className={styles.livePulseDot} />
            {"// VERIFIED_PACKAGE_RADAR"}
          </span>
          <span className={styles.rankBadge}>
            {safeIndex === 0 ? `★ TOP DEAL 1 OF ${deals.length} · BEST VALUE` : `OPTION ${safeIndex + 1} OF ${deals.length}`}
          </span>
          <span className={styles.realismBadge}>
            REALISM {deal.realism_score.toFixed(1)}/10
          </span>
        </div>

        {/* Carousel Arrow Controls */}
        <div className={styles.carouselControls}>
          <button
            type="button"
            className={styles.carouselArrowBtn}
            onClick={handlePrev}
            disabled={safeIndex === 0}
            aria-label="Previous deal package"
            title="Previous deal package"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className={styles.counterText}>
            <strong>{safeIndex + 1}</strong> / {deals.length}
          </span>

          <button
            type="button"
            className={styles.carouselArrowBtn}
            onClick={handleNext}
            disabled={safeIndex === deals.length - 1}
            aria-label="Next deal package"
            title="Next deal package"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Deal Card Content */}
      <div className={styles.dealContent}>
        {/* Route Title & Price Summary Row */}
        <div className={styles.headerRow}>
          <div className={styles.routeBlock}>
            <h3 className={styles.dealRouteTitle}>
              <span>{deal.origin_name}</span>
              <span className={styles.routeIata}>({deal.origin_iata})</span>
              <span className={styles.arrowSep} aria-hidden="true">→</span>
              <span>{deal.destination_name}</span>
              <span className={styles.routeIata}>({deal.destination_code})</span>
            </h3>
            <span className={styles.dealDatesSub}>
              {deal.depart_date} → {deal.return_date} · {deal.nights} Nights Stay & Flight
            </span>
          </div>

          <div className={styles.priceComparisonBox}>
            <div className={styles.priceItem}>
              <span className={styles.priceLabel}>Landed Package</span>
              <span className={styles.currentPrice}>{formatCurrencyAmount(deal.total_price_eur, activeCurrency)}</span>
            </div>
            <div className={styles.priceItem}>
              <span className={styles.priceLabel}>Typical Benchmark</span>
              <span className={styles.medianPrice}>{formatCurrencyAmount(deal.baseline_median_eur, activeCurrency)}</span>
            </div>
            <div className={styles.savingsBox}>
              <span className={styles.savingsPill}>
                <TrendingDownIcon size={13} color="#FFFFFF" />
                {deal.discount_pct.toFixed(0)}% OFF
              </span>
              <span className={styles.savingsAmountText}>Save {formatCurrencyAmount(deal.savings_eur, activeCurrency)} vs typical</span>
            </div>
          </div>
        </div>

        {/* Dual Components: Flight + Hotel */}
        <div className={styles.componentsGrid}>
          {/* Flight Card */}
          <div className={styles.componentCard}>
            <div className={styles.componentHeader}>
              <span className={styles.componentTypeTitle}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                </svg>
                Flight Corridor
              </span>
              <span className={styles.carrierBadge}>
                {deal.flight.airline} {deal.flight.flight_number ? `· ${deal.flight.flight_number}` : '· Direct'}
              </span>
            </div>
            <div className={styles.componentDetails}>
              {/* Outbound Flight */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={styles.componentMainName}>
                  Outbound: {deal.origin_name} ({deal.origin_iata}) → {deal.destination_name} ({deal.destination_code})
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                  {formatCurrencyAmount(deal.flight.landed_price_eur, activeCurrency)}
                </span>
              </div>
              <span className={styles.componentSubText}>
                {deal.depart_date} · {deal.flight.depart_time.slice(11, 16)} → {deal.flight.arrival_time.slice(11, 16)} · Direct ({deal.flight.airline})
              </span>

              {/* Return Flight */}
              {deal.return_flight && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--color-border, #E2D9CC)' }}>
                    <span className={styles.componentMainName}>
                      Return: {deal.destination_name} ({deal.destination_code}) → {deal.origin_name} ({deal.origin_iata})
                    </span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                      {formatCurrencyAmount(deal.return_flight.landed_price_eur, activeCurrency)}
                    </span>
                  </div>
                  <span className={styles.componentSubText}>
                    {deal.return_date} · {deal.return_flight.depart_time.slice(11, 16)} → {deal.return_flight.arrival_time.slice(11, 16)} · Direct ({deal.return_flight.airline})
                  </span>
                </>
              )}
            </div>
            <div className={styles.componentPriceRow}>
              <span className={styles.componentPrice}>
                {formatCurrencyAmount(deal.flight.landed_price_eur + (deal.return_flight?.landed_price_eur ?? 0), activeCurrency)} Roundtrip Flights
              </span>
              {deal.flight.booking_url && (
                <a
                  href={deal.flight.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.directLinkBtn}
                >
                  Book Flights ↗
                </a>
              )}
            </div>
          </div>

          {/* Hotel Card */}
          <div className={styles.componentCard}>
            <div className={styles.componentHeader}>
              <span className={styles.componentTypeTitle}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1M15 13h1M15 17h1" />
                </svg>
                Accommodation
              </span>
              <span className={styles.carrierBadge}>
                {deal.lodging.stars ? `★ ${deal.lodging.stars}-Star Hotel` : (deal.lodging.quality_score ? `★ ${deal.lodging.quality_score.toFixed(0)} Quality` : '★ Verified Stay')}
              </span>
            </div>
            <div className={styles.componentDetails}>
              <span className={styles.componentMainName}>
                {deal.lodging.property_name}
              </span>
              <span className={styles.componentSubText}>
                {deal.lodging.review_score ? `★ ${deal.lodging.review_score}/5` : ''} {deal.lodging.review_count ? `(${deal.lodging.review_count} reviews)` : ''} · {formatCurrencyAmount(deal.lodging.nightly_base_eur, activeCurrency)}/night
              </span>
            </div>
            <div className={styles.componentPriceRow}>
              <span className={styles.componentPrice}>
                {formatCurrencyAmount(deal.lodging.landed_total_eur, activeCurrency)} Landed ({deal.nights} Nights)
              </span>
              {deal.lodging.booking_url && (
                <a
                  href={deal.lodging.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.directLinkBtn}
                >
                  Book Hotel ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.footerRow}>
          <span className={styles.footerPrompt}>
            Verified flight + hotel deal package ready for autonomous trip creation.
          </span>
          <div className={styles.actionGroup}>
            {onDiscardDeal && (
              <button
                type="button"
                className={styles.discardBtn}
                onClick={() => onDiscardDeal(deal.id)}
              >
                Discard Offer
              </button>
            )}
            <button
              type="button"
              className={styles.makeTripBtn}
              onClick={handleMakeTrip}
            >
              Make it a Trip ➔
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
