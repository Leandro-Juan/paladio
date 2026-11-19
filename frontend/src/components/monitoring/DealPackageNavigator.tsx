"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { DealPackage } from '@/hooks/useRouteMonitoring';
import { TrendingDownIcon, ChevronRightIcon } from '@/components/icons';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import { prepareDealTripNavigation } from '@/utils/dealToTrip';
import { HotelTicketCard } from './HotelTicketCard';
import styles from './DealPackageNavigator.module.css';

interface DealPackageNavigatorProps {
  deals: DealPackage[];
  currency?: string;
  onDiscardDeal?: (id: string) => Promise<void> | void;
}

export function DealPackageNavigator({ deals, currency, onDiscardDeal }: DealPackageNavigatorProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const validDeals = (deals || []).filter((d) => Boolean(d.flight && d.return_flight));

  if (validDeals.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, currentIndex), validDeals.length - 1);
  const deal = validDeals[safeIndex];
  const activeCurrency = deal?.currency || currency || 'EUR';

  const travelerCount = deal?.travelers || 1;
  const isMultiTraveler = travelerCount > 1;
  const unitPrice = deal?.price_per_traveler_eur ?? (deal ? deal.total_price_eur / travelerCount : 0);
  const unitMedian = deal?.median_per_traveler_eur ?? (deal ? deal.baseline_median_eur / travelerCount : 0);
  const unitSavings = deal?.savings_per_traveler_eur ?? (deal ? deal.savings_eur / travelerCount : 0);

  const outboundTotal = deal?.flight?.landed_price_eur ?? 0;
  const outboundUnit = deal?.flight?.unit_price_eur ?? (outboundTotal / travelerCount);

  const returnTotal = deal?.return_flight?.landed_price_eur ?? 0;
  const returnUnit = deal?.return_flight?.unit_price_eur ?? (returnTotal / travelerCount);

  const flightsTotal = outboundTotal + returnTotal;
  const flightsUnit = outboundUnit + returnUnit;

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(validDeals.length - 1, prev + 1));
  };

  const handleMakeTrip = () => {
    router.push(prepareDealTripNavigation(deal, activeCurrency));
  };

  return (
    <section className={styles.container} aria-label={t('monitoring.top_deals_navigator_aria')}>
      {/* Navigator Top Control Header */}
      <div className={styles.navTopBar}>
        <div className={styles.badgeGroup}>
          <span className={styles.rankBadge}>
            {safeIndex === 0
              ? t('monitoring.top_deal_badge', { total: validDeals.length })
              : t('monitoring.option_of_badge', { index: safeIndex + 1, total: validDeals.length })}
          </span>
        </div>

        {/* Carousel Arrow Controls */}
        <div className={styles.carouselControls}>
          <button
            type="button"
            className={styles.carouselArrowBtn}
            onClick={handlePrev}
            disabled={safeIndex === 0}
            aria-label={t('monitoring.prev_deal_package')}
            data-tooltip={t('monitoring.prev_deal_package')}
            data-tooltip-position="top"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className={styles.counterText}>
            <strong>{safeIndex + 1}</strong> / {validDeals.length}
          </span>

          <button
            type="button"
            className={styles.carouselArrowBtn}
            onClick={handleNext}
            disabled={safeIndex === validDeals.length - 1}
            aria-label={t('monitoring.next_deal_package')}
            data-tooltip={t('monitoring.next_deal_package')}
            data-tooltip-position="top"
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
              {deal.depart_date} → {deal.return_date} · {t('monitoring.nights_stay_flight', { nights: deal.nights })}
              {deal.travelers && deal.travelers > 1 ? ` · ${t('monitoring.travelers_count_label', { count: deal.travelers })}` : ''}
            </span>
          </div>

          <div className={styles.priceComparisonBox}>
            <div className={styles.priceItem}>
              <span className={styles.priceLabel}>{t('monitoring.landed_package')}</span>
              <span className={styles.currentPrice}>
                {formatCurrencyAmount(isMultiTraveler ? unitPrice : deal.total_price_eur, activeCurrency)}
                {isMultiTraveler && <span className={styles.unitSuffix}> {t('workspace.per_person')}</span>}
              </span>
              {isMultiTraveler && (
                <span className={styles.totalPriceSub}>
                  {t('monitoring.amount_total', { amount: formatCurrencyAmount(deal.total_price_eur, activeCurrency) })}
                </span>
              )}
            </div>
            <div className={styles.priceItem}>
              <span className={styles.priceLabel}>{t('monitoring.typical_benchmark')}</span>
              <span className={styles.medianPrice}>
                {formatCurrencyAmount(isMultiTraveler ? unitMedian : deal.baseline_median_eur, activeCurrency)}
                {isMultiTraveler && <span className={styles.unitSuffix}> {t('monitoring.per_pers')}</span>}
              </span>
              {isMultiTraveler && (
                <span className={styles.totalPriceSub}>
                  {t('monitoring.amount_total', { amount: formatCurrencyAmount(deal.baseline_median_eur, activeCurrency) })}
                </span>
              )}
            </div>
            <div className={styles.savingsBox}>
              <span className={styles.savingsPill}>
                <TrendingDownIcon size={13} color="#FFFFFF" />
                {t('monitoring.pct_off', { pct: (deal.discount_pct ?? 0).toFixed(0) })}
              </span>
              <span className={styles.savingsAmountText}>
                {isMultiTraveler
                  ? t('monitoring.save_per_person', { amount: formatCurrencyAmount(unitSavings, activeCurrency) })
                  : t('monitoring.save_vs_typical', { amount: formatCurrencyAmount(deal.savings_eur, activeCurrency) })}
              </span>
              {isMultiTraveler && (
                <span className={styles.totalSavingsSub}>
                  {t('monitoring.total_savings_parens', { amount: formatCurrencyAmount(deal.savings_eur, activeCurrency) })}
                </span>
              )}
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
                {t('monitoring.flight_corridor')}
              </span>
              <span className={styles.carrierBadge}>
                {deal.flight?.airline || t('monitoring.direct')} {deal.flight?.flight_number ? `· ${deal.flight.flight_number}` : ''}
              </span>
            </div>
            <div className={styles.componentDetails}>
              {/* Outbound Flight */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={styles.componentMainName}>
                  {t('monitoring.outbound_route', {
                    origin: `${deal.origin_name} (${deal.origin_iata})`,
                    dest: `${deal.destination_name} (${deal.destination_code})`,
                  })}
                </span>
                {isMultiTraveler ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                      {formatCurrencyAmount(outboundUnit, activeCurrency)} <span className={styles.unitSuffix}>{t('monitoring.per_pers')}</span>
                    </div>
                    <div className={styles.totalPriceSub}>
                      {t('monitoring.amount_total', { amount: formatCurrencyAmount(outboundTotal, activeCurrency) })}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                    {formatCurrencyAmount(outboundTotal, activeCurrency)}
                  </span>
                )}
              </div>
              <span className={styles.componentSubText}>
                {deal.flight?.depart_time && deal.flight?.arrival_time
                  ? `${deal.depart_date} · ${deal.flight.depart_time.slice(11, 16)} → ${deal.flight.arrival_time.slice(11, 16)} · ${t('monitoring.direct_airline', { airline: deal.flight?.airline || t('monitoring.direct') })}`
                  : deal.depart_date}
              </span>

              {/* Return Flight */}
              {deal.return_flight && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--color-border, #E2D9CC)' }}>
                    <span className={styles.componentMainName}>
                      {t('monitoring.return_route', {
                        dest: `${deal.destination_name} (${deal.destination_code})`,
                        origin: `${deal.origin_name} (${deal.origin_iata})`,
                      })}
                    </span>
                    {isMultiTraveler ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                          {formatCurrencyAmount(returnUnit, activeCurrency)} <span className={styles.unitSuffix}>{t('monitoring.per_pers')}</span>
                        </div>
                        <div className={styles.totalPriceSub}>
                          {t('monitoring.amount_total', { amount: formatCurrencyAmount(returnTotal, activeCurrency) })}
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                        {formatCurrencyAmount(returnTotal, activeCurrency)}
                      </span>
                    )}
                  </div>
                  <span className={styles.componentSubText}>
                    {deal.return_flight?.depart_time && deal.return_flight?.arrival_time
                      ? `${deal.return_date} · ${deal.return_flight.depart_time.slice(11, 16)} → ${deal.return_flight.arrival_time.slice(11, 16)} · ${t('monitoring.direct_airline', { airline: deal.return_flight?.airline || t('monitoring.direct') })}`
                      : deal.return_date}
                  </span>
                </>
              )}
            </div>
            <div className={styles.componentPriceRow}>
              <span className={styles.componentPrice}>
                {isMultiTraveler
                  ? t('monitoring.flights_multi_summary', {
                      unit: formatCurrencyAmount(flightsUnit, activeCurrency),
                      total: formatCurrencyAmount(flightsTotal, activeCurrency),
                      count: travelerCount,
                    })
                  : t('monitoring.roundtrip_flights_price', { total: formatCurrencyAmount(flightsTotal, activeCurrency) })}
              </span>
              {deal.flight?.booking_url && (
                <a
                  href={deal.flight.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.directLinkBtn}
                >
                  {t('monitoring.book_flights')}
                </a>
              )}
            </div>
          </div>

          {/* Hotel Ticket Card */}
          <HotelTicketCard deal={deal} dealCurrency={activeCurrency} />
        </div>

        {/* Footer Actions */}
        <div className={styles.footerRow}>
          <div className={styles.actionGroup}>
            {onDiscardDeal && (
              <button
                type="button"
                className={styles.discardBtn}
                onClick={() => onDiscardDeal(deal.id)}
              >
                {t('monitoring.discard_offer')}
              </button>
            )}
            <button
              type="button"
              className={styles.makeTripBtn}
              onClick={handleMakeTrip}
            >
              {t('monitoring.make_it_a_trip')} <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
