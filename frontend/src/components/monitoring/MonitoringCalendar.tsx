"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { RouteCalendar, CalendarDay, LodgingSummary } from '@/hooks/useRouteMonitoring';
import { PlaneIcon, CloseIcon, ChevronRightIcon } from '@/components/icons';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import { useTrips, Trip } from '@/hooks/useTrips';
import { useOptionalAuth } from '@/contexts/AuthContext';
import styles from './MonitoringCalendar.module.css';

interface MonitoringCalendarProps {
  calendar: RouteCalendar | null;
  currency?: string;
  onMonthsCountChange?: (count: number) => void;
  onViewChange?: (view: 'outbound' | 'inbound' | 'roundtrip', monthsCount: number) => void;
  onPlanItinerary?: (day: CalendarDay) => void;
  onFetchLodging?: (checkIn: string, nights: number) => Promise<LodgingSummary | null>;
}

const WEEKDAY_KEYS = [
  'monitoring.weekday_m',
  'monitoring.weekday_t',
  'monitoring.weekday_w',
  'monitoring.weekday_th',
  'monitoring.weekday_f',
  'monitoring.weekday_sa',
  'monitoring.weekday_su',
] as const;

export function MonitoringCalendar({
  calendar,
  currency,
  onMonthsCountChange,
  onViewChange,
  onPlanItinerary,
  onFetchLodging,
}: MonitoringCalendarProps) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const auth = useOptionalAuth();
  const activeCurrency = calendar?.currency || currency || 'EUR';
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [hoveredDay, setHoveredDay] = useState<CalendarDay | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(4);
  const [currentView, setCurrentView] = useState<'outbound' | 'inbound' | 'roundtrip'>(
    calendar?.view || 'roundtrip'
  );
  const [isFetchingLodging, setIsFetchingLodging] = useState<boolean>(false);
  const [dayLodgingMap, setDayLodgingMap] = useState<Record<string, LodgingSummary>>({});

  // Existing trips from database
  const { trips: fetchedTrips } = useTrips();
  const validTrips = useMemo(() => {
    return (fetchedTrips || []).filter((t) => t.start_date && t.end_date);
  }, [fetchedTrips]);

  const getTripForDate = (dateStr: string) => {
    for (const t of validTrips) {
      if (dateStr >= t.start_date && dateStr <= t.end_date) {
        return {
          trip: t,
          isStart: dateStr === t.start_date,
          isEnd: dateStr === t.end_date,
          inRange: dateStr > t.start_date && dateStr < t.end_date,
        };
      }
    }
    return null;
  };

  // User marked holidays from Dashboard Calendar / DB preferences
  const serverHolidayDates = auth?.user?.preferences?.holiday_dates;
  const userHolidays = useMemo(() => {
    if (Array.isArray(serverHolidayDates)) {
      return new Set<string>(serverHolidayDates.map(String));
    }
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem('paladio_user_holidays');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [serverHolidayDates]);

  // Top 3 best package dates
  const top3Dates = useMemo(() => {
    if (calendar?.top_dates && calendar.top_dates.length > 0) {
      return new Map<string, number>(
        calendar.top_dates.slice(0, 3).map((dt, idx) => [dt, idx + 1])
      );
    }
    if (!calendar?.months) return new Map<string, number>();
    const valid: { date: string; price: number }[] = [];
    calendar.months.forEach((m) => {
      m.days.forEach((d) => {
        if (d.price_eur !== null) {
          valid.push({ date: d.date, price: d.price_eur });
        }
      });
    });
    valid.sort((a, b) => a.price - b.price);
    return new Map<string, number>(
      valid.slice(0, 3).map((item, idx) => [item.date, idx + 1])
    );
  }, [calendar]);

  const activeStayRange = useMemo(() => {
    const target = hoveredDay || selectedDay;
    if (target?.nights && target?.return_date) {
      return { start: target.date, end: target.return_date };
    }
    return null;
  }, [hoveredDay, selectedDay]);

  const handleMonthsChange = (count: number) => {
    setMonthsCount(count);
    if (onMonthsCountChange) {
      onMonthsCountChange(count);
    }
    if (onViewChange) {
      onViewChange(currentView, count);
    }
  };

  const handleViewChange = (v: 'outbound' | 'inbound' | 'roundtrip') => {
    setCurrentView(v);
    setSelectedDay(null);
    if (onViewChange) {
      onViewChange(v, monthsCount);
    }
  };

  // Dynamic on-demand lodging fetching for selected day
  useEffect(() => {
    if (!selectedDay || currentView !== 'roundtrip' || !onFetchLodging) return;
    const dateKey = selectedDay.date;
    // Skip if already observed with authentic property details
    if (dayLodgingMap[dateKey]?.property_name || selectedDay.lodging?.property_name) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setIsFetchingLodging(true);
      }
    });

    const nights = selectedDay.nights || 3;
    onFetchLodging(dateKey, nights)
      .then((res) => {
        if (isMounted && res) {
          setDayLodgingMap((prev) => ({ ...prev, [dateKey]: res }));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsFetchingLodging(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDay?.date, selectedDay?.nights, currentView, onFetchLodging]);

  const effectiveLodging: LodgingSummary | null = useMemo(() => {
    if (!selectedDay) return null;
    return dayLodgingMap[selectedDay.date] || selectedDay.lodging || null;
  }, [selectedDay, dayLodgingMap]);

  const dynamicCombinedPrice = useMemo(() => {
    if (!selectedDay || selectedDay.price_eur === null) return null;
    if (currentView === 'roundtrip' && effectiveLodging) {
      const outP = selectedDay.outbound_flight?.price_eur;
      const retP = selectedDay.return_flight?.price_eur;
      if (typeof outP === 'number' && typeof retP === 'number') {
        return Math.round((outP + retP + effectiveLodging.total_lodging_eur) * 100) / 100;
      }
    }
    return selectedDay.price_eur;
  }, [selectedDay, currentView, effectiveLodging]);

  if (!calendar || !calendar.months || calendar.months.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <span className={styles.telemetryTag} aria-hidden="true">{"// MULTI_MONTH_DISPATCH"}</span>
        <h4 className={styles.title}>{t('monitoring.price_calendar_matrix')}</h4>
        <p className={styles.emptyText}>{t('monitoring.loading_price_matrix')}</p>
      </div>
    );
  }

  return (
    <div className={styles.container} role="region" aria-label={t('monitoring.calendar_matrix_aria')}>
      <div className={styles.header}>
        <div>
          <span className={styles.telemetryTag} aria-hidden="true">{"// MULTI_MONTH_DISPATCH"}</span>
          <h4 className={styles.title}>{t('monitoring.multi_month_price_matrix')}</h4>
          <span className={styles.routeLabel}>{calendar.route_label}</span>
        </div>

        <div className={styles.controls}>
          {/* Horizon Toggle: strictly 4M vs FULL HORIZON */}
          <div className={styles.monthsToggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${monthsCount <= 4 ? styles.activeToggleBtn : ''}`}
              onClick={() => handleMonthsChange(4)}
            >
              {t('monitoring.horizon_4m')}
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${monthsCount > 4 ? styles.activeToggleBtn : ''}`}
              onClick={() => handleMonthsChange(11)}
            >
              {t('monitoring.horizon_full')}
            </button>
          </div>

          {/* View Toggle */}
          <div className={styles.viewSelector}>
            {(['outbound', 'inbound', 'roundtrip'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.toggleBtn} ${currentView === v ? styles.activeToggleBtn : ''}`}
                onClick={() => handleViewChange(v)}
              >
                {v === 'roundtrip'
                  ? t('monitoring.dir_best_roundtrip_upper')
                  : v === 'outbound'
                  ? t('monitoring.dir_outbound_upper')
                  : t('monitoring.dir_inbound_upper')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend Ribbon */}
      <div className={styles.legendRibbon}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierDeal}`} />
          <span>{t('monitoring.legend_deal')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierFair}`} />
          <span>{t('monitoring.legend_fair')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierStandard}`} />
          <span>{t('monitoring.legend_standard')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierPeak}`} />
          <span>{t('monitoring.legend_peak')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierNoData}`} />
          <span>{t('monitoring.legend_no_flight')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tripCapDay}`} />
          <span>{t('monitoring.legend_booked_trip')}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.holidayDay}`} />
          <span>{t('monitoring.legend_holiday_pto')}</span>
        </div>
      </div>

      {/* Multi-Month Grid Container */}
      <div
        className={`${styles.monthsGrid} ${
          monthsCount === 4 ? styles.monthsGrid4M : styles.monthsGridFull
        }`}
      >
        {calendar.months.slice(0, monthsCount).map((m) => {
          const displayMonthName =
            locale === 'en'
              ? m.month_name
              : new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(m.year, (m.month || 1) - 1, 1))
                );
          return (
          <div key={`${m.year}-${m.month}`} className={styles.monthColumn}>
            <div className={styles.monthHeader}>
              <span className={styles.monthName}>{displayMonthName}</span>
              <span className={styles.monthYear}>{m.year}</span>
            </div>

            <div className={styles.weekdayRow}>
              {WEEKDAY_KEYS.map((wk, idx) => (
                <span key={`${wk}-${idx}`} className={styles.weekdayCell}>
                  {t(wk)}
                </span>
              ))}
            </div>

            <div className={styles.daysGrid}>
              {/* Prepend empty offset cells for 1st day of month weekday (0=Mon, 6=Sun) */}
              {Array.from({ length: m.days[0]?.weekday || 0 }).map((_, i) => (
                <div key={`empty-${i}`} className={styles.emptyDayCell} />
              ))}

              {m.days.map((d) => {
                const tierClass =
                  d.price_tier === 'deal'
                    ? styles.tierDeal
                    : d.price_tier === 'fair'
                    ? styles.tierFair
                    : d.price_tier === 'standard'
                    ? styles.tierStandard
                    : d.price_tier === 'peak'
                    ? styles.tierPeak
                    : styles.tierNoData;

                const isSelected = selectedDay?.date === d.date;
                const isInRange = Boolean(
                  activeStayRange && d.date >= activeStayRange.start && d.date <= activeStayRange.end
                );
                const topRank = top3Dates.get(d.date);
                const isUserHoliday = userHolidays.has(d.date);
                const tripInfo = getTripForDate(d.date);
                const isTripCap = Boolean(tripInfo && (tripInfo.isStart || tripInfo.isEnd));
                const isTripInRange = Boolean(tripInfo && tripInfo.inRange);
                let fitsHolidayWindow = false;
                if (d.nights && d.return_date && isUserHoliday) {
                  const depD = new Date(d.date);
                  const retD = new Date(d.return_date);
                  let allCovered = true;
                  const cur = new Date(depD);
                  while (cur <= retD) {
                    const s = cur.toISOString().split('T')[0];
                    if (!userHolidays.has(s)) {
                      allCovered = false;
                      break;
                    }
                    cur.setDate(cur.getDate() + 1);
                  }
                  fitsHolidayWindow = allCovered;
                }

                const tooltipPosClass = d.day <= 4 ? styles.tooltipBelow : styles.tooltipAbove;
                const tooltipAlignClass =
                  d.weekday === 0
                    ? styles.tooltipAlignLeft
                    : d.weekday === 6
                    ? styles.tooltipAlignRight
                    : styles.tooltipAlignCenter;

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`${styles.dayCell} ${tierClass} ${isSelected ? styles.selectedDay : ''} ${
                      isInRange ? styles.inRangeDay : ''
                    } ${!isSelected && !isInRange && isTripCap ? styles.tripCapDay : ''} ${
                      !isSelected && !isInRange && isTripInRange ? styles.tripInRangeDay : ''
                    } ${!isSelected && !isInRange && !tripInfo && isUserHoliday ? styles.holidayDay : ''} ${
                      topRank ? styles[`topDay${topRank}`] : ''
                    }`}
                    onClick={() => setSelectedDay(d)}
                    onMouseEnter={() => {
                      if (d.nights && d.return_date) {
                        setHoveredDay(d);
                      }
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    aria-label={`${d.date}, ${
                      d.price_eur
                        ? t('monitoring.day_aria_price', { price: formatCurrencyAmount(d.price_eur, activeCurrency) })
                        : t('monitoring.day_aria_no_flight')
                    }${tripInfo ? t('monitoring.day_aria_trip_to', { dest: tripInfo.trip.destination }) : ''}`}
                  >
                    {isUserHoliday && (
                      <span className={styles.holidayMarker} />
                    )}
                    {topRank && (
                      <span className={`${styles.topRankBadge} ${styles[`topRank${topRank}`]}`}>
                        #{topRank}
                      </span>
                    )}
                    {fitsHolidayWindow && (
                      <span className={styles.fitsHolidayBadge}>{t('monitoring.pto_badge')}</span>
                    )}
                    <span className={styles.dayNum}>{d.day}</span>
                    <span className={styles.dayPrice}>
                      {d.price_eur !== null ? formatCurrencyAmount(d.price_eur, activeCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'}
                    </span>

                    {/* Native Paladio Aesthetic Day Tooltip */}
                    <span
                      role="tooltip"
                      className={`${styles.dayTooltip} ${tooltipPosClass} ${tooltipAlignClass}`}
                    >
                      <span className={styles.dayTooltipHeader}>
                        <span className={styles.dayTooltipDate}>{d.date}</span>
                        <span className={styles.dayTooltipPrice}>
                          {d.price_eur ? formatCurrencyAmount(d.price_eur, activeCurrency) : t('monitoring.no_flight_title')}
                        </span>
                      </span>
                      {(d.nights || topRank || isUserHoliday || tripInfo) && (
                        <span className={styles.dayTooltipSub}>
                          {tripInfo ? t('monitoring.tooltip_trip', { dest: tripInfo.trip.destination }) : ''}
                          {d.nights ? `${tripInfo ? ' · ' : ''}${t('monitoring.tooltip_nights_stay', { nights: d.nights, returnDate: d.return_date || '' })}` : ''}
                          {topRank ? ` · ${t('monitoring.tooltip_best_value', { rank: topRank })}` : ''}
                          {isUserHoliday ? ` · ${t('monitoring.tooltip_vacation_pto')}` : ''}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Selected Day Inspection Card */}
      {selectedDay && (
        <div className={styles.dayInspectorCard}>
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitleGroup}>
              <PlaneIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
              <span className={styles.inspectorDate}>
                {selectedDay.date}
                {selectedDay.return_date ? ` → ${selectedDay.return_date} ${t('monitoring.nights_parens', { nights: selectedDay.nights ?? 0 })}` : ''}
              </span>
              <span className={`${styles.inspectorTierBadge} ${styles[`tier_${selectedDay.price_tier}`]}`}>
                {selectedDay.price_tier === 'deal'
                  ? t('monitoring.tier_deal_upper')
                  : selectedDay.price_tier === 'fair'
                  ? t('monitoring.tier_fair_upper')
                  : selectedDay.price_tier === 'standard'
                  ? t('monitoring.tier_standard_upper')
                  : selectedDay.price_tier === 'peak'
                  ? t('monitoring.tier_peak_upper')
                  : selectedDay.price_tier === 'no_data'
                  ? t('monitoring.tier_no_data_upper')
                  : String(selectedDay.price_tier).toUpperCase()}
              </span>
              {top3Dates.has(selectedDay.date) && (
                <span className={styles.topRankPill}>
                  {t('monitoring.top_rank_best_value', { rank: top3Dates.get(selectedDay.date) ?? 1 })}
                </span>
              )}
              {userHolidays.has(selectedDay.date) && (
                <span className={styles.holidayBadgePill}>{t('monitoring.scheduled_pto')}</span>
              )}
            </div>
            <button
              type="button"
              className={styles.closeInspectorBtn}
              onClick={() => setSelectedDay(null)}
              aria-label={t('monitoring.close_day_detail')}
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <div className={styles.inspectorBody}>
            {selectedDay.nights && selectedDay.return_date && userHolidays.has(selectedDay.date) && (
              <div className={styles.holidayMatchBanner}>
                <span>{t('monitoring.all_dates_fit_pto')}</span>
              </div>
            )}
            <div className={styles.inspectorFare}>
              <span className={styles.inspectorFareLabel}>
                {selectedDay.nights
                  ? (effectiveLodging ? t('monitoring.combined_package_estimate') : t('monitoring.total_roundtrip_fare'))
                  : t('monitoring.observed_fare')}
              </span>
              <span className={styles.inspectorFareValue}>
                {dynamicCombinedPrice !== null ? formatCurrencyAmount(dynamicCombinedPrice, activeCurrency) : t('monitoring.no_operating_flight')}
              </span>
            </div>

            {selectedDay.outbound_flight && selectedDay.return_flight ? (
              <div className={styles.flightCardsGrid}>
                {/* Outbound Card */}
                <div className={styles.flightCard}>
                  <div className={styles.cardHeader}>
                    <span>{t('monitoring.outbound_flight_upper')}</span>
                    {selectedDay.outbound_flight.price_eur !== null && (
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(selectedDay.outbound_flight.price_eur, activeCurrency)}
                      </span>
                    )}
                  </div>
                  <span className={styles.metaVal}>
                    {selectedDay.outbound_flight.carrier} {selectedDay.outbound_flight.flight_number || ''}
                  </span>
                  <span className={styles.metaLabel}>
                    {t('monitoring.departure_time_label', { time: selectedDay.outbound_flight.departure_time || '—' })}
                  </span>
                  {selectedDay.outbound_flight.duration_mins && (
                    <span className={styles.metaLabel}>
                      {t('monitoring.duration_hm_label', {
                        hours: Math.floor(selectedDay.outbound_flight.duration_mins / 60),
                        mins: selectedDay.outbound_flight.duration_mins % 60,
                      })}
                    </span>
                  )}
                  {selectedDay.outbound_flight.booking_url && (
                    <a
                      href={selectedDay.outbound_flight.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.bookingLink}
                    >
                      {t('monitoring.book_outbound')}
                    </a>
                  )}
                </div>

                {/* Return Card */}
                <div className={styles.flightCard}>
                  <div className={styles.cardHeader}>
                    <span>{t('monitoring.return_flight_date', { date: selectedDay.return_date || '' })}</span>
                    {selectedDay.return_flight.price_eur !== null && (
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(selectedDay.return_flight.price_eur, activeCurrency)}
                      </span>
                    )}
                  </div>
                  <span className={styles.metaVal}>
                    {selectedDay.return_flight.carrier} {selectedDay.return_flight.flight_number || ''}
                  </span>
                  <span className={styles.metaLabel}>
                    {t('monitoring.departure_time_label', { time: selectedDay.return_flight.departure_time || '—' })}
                  </span>
                  {selectedDay.return_flight.duration_mins && (
                    <span className={styles.metaLabel}>
                      {t('monitoring.duration_hm_label', {
                        hours: Math.floor(selectedDay.return_flight.duration_mins / 60),
                        mins: selectedDay.return_flight.duration_mins % 60,
                      })}
                    </span>
                  )}
                  {selectedDay.return_flight.booking_url && (
                    <a
                      href={selectedDay.return_flight.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.bookingLink}
                    >
                      {t('monitoring.book_return')}
                    </a>
                  )}
                </div>

                {/* Lodging Card */}
                {isFetchingLodging ? (
                  <div className={styles.flightCard}>
                    <div className={styles.cardHeader}>
                      <span>{t('monitoring.live_accommodation_upper')}</span>
                      <span className={styles.scanningPulse}>{t('monitoring.scanning_upper')}</span>
                    </div>
                    <span className={styles.metaVal}>
                      {t('monitoring.querying_lodging')}
                    </span>
                    <span className={styles.metaLabel}>
                      {t('monitoring.fetching_live_rates', { nights: selectedDay.nights || 3 })}
                    </span>
                  </div>
                ) : effectiveLodging ? (
                  <div className={styles.flightCard}>
                    <div className={styles.cardHeader}>
                      <span>
                        {effectiveLodging.property_name ? t('monitoring.accommodation_upper') : t('monitoring.hotel_benchmark_upper')} ({effectiveLodging.nights}N)
                        {effectiveLodging.badge && (
                          <span className={styles.lodgingBadge} style={{ marginLeft: '0.5rem' }}>
                            {effectiveLodging.badge === 'best_value' ? t('monitoring.lodging_badge_best_value') :
                             effectiveLodging.badge === 'cheapest' ? t('monitoring.lodging_badge_cheapest') :
                             effectiveLodging.badge === 'top_rated' ? t('monitoring.lodging_badge_top_rated') :
                             effectiveLodging.badge === 'central' ? t('monitoring.lodging_badge_central') : effectiveLodging.badge.toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(effectiveLodging.total_lodging_eur, activeCurrency)}
                      </span>
                    </div>
                    <span className={styles.metaVal}>
                      {effectiveLodging.property_name ||
                        t('monitoring.est_per_night', { price: formatCurrencyAmount(effectiveLodging.price_per_night_eur, activeCurrency) })}
                    </span>
                    <span className={styles.metaLabel}>
                      {effectiveLodging.property_name ? (
                        <>
                          {effectiveLodging.stars ? t('monitoring.star_rating_prefix', { stars: effectiveLodging.stars }) : ''}
                          {effectiveLodging.review_score ? t('monitoring.rated_score_prefix', { score: effectiveLodging.review_score }) : ''}
                          {t('monitoring.price_per_night_spaced', { price: formatCurrencyAmount(effectiveLodging.price_per_night_eur, activeCurrency) })}
                        </>
                      ) : (
                        t('monitoring.median_benchmark_nights', { nights: effectiveLodging.nights })
                      )}
                    </span>
                    {effectiveLodging.booking_url && (
                      <a
                        href={effectiveLodging.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.bookingLink}
                      >
                        {t('monitoring.book_hotel')}
                      </a>
                    )}
                  </div>
                ) : null}
              </div>
            ) : selectedDay.carrier ? (
              <div className={styles.inspectorMetaRow}>
                <div className={styles.metaCol}>
                  <span className={styles.metaLabel}>{t('monitoring.carrier_label')}</span>
                  <span className={styles.metaVal}>
                    {selectedDay.carrier} {selectedDay.flight_number || ''}
                  </span>
                </div>
                {selectedDay.departure_time && (
                  <div className={styles.metaCol}>
                    <span className={styles.metaLabel}>{t('monitoring.departure_label')}</span>
                    <span className={styles.metaVal}>{selectedDay.departure_time}</span>
                  </div>
                )}
                {selectedDay.duration_mins && (
                  <div className={styles.metaCol}>
                    <span className={styles.metaLabel}>{t('monitoring.flight_duration_label')}</span>
                    <span className={styles.metaVal}>
                      {t('monitoring.hm_duration', {
                        hours: Math.floor(selectedDay.duration_mins / 60),
                        mins: selectedDay.duration_mins % 60,
                      })}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            {selectedDay.booking_url && !selectedDay.outbound_flight && (
              <a
                href={selectedDay.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.bookingLink}
              >
                <span>{t('monitoring.book_live_fare')}</span>
                <ChevronRightIcon size={14} aria-hidden="true" />
              </a>
            )}

            {/* Plan Itinerary Button */}
            <button
              type="button"
              className={styles.planItineraryBtn}
              onClick={() => {
                if (onPlanItinerary) {
                  onPlanItinerary(selectedDay);
                } else {
                  const destCode = calendar.route_label.split('(')[1]?.replace(')', '') || '';
                  const params = new URLSearchParams({
                    depart: selectedDay.date,
                    ...(selectedDay.return_date ? { return: selectedDay.return_date } : {}),
                    ...(destCode ? { destination: destCode } : {}),
                  });
                  router.push(`/trips/new?${params.toString()}`);
                }
              }}
            >
              <span>{t('monitoring.plan_itinerary_dates')}</span>
              <ChevronRightIcon size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
