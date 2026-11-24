"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { Trip } from '@/hooks/useTrips';
import { apiFetch, updatePreferencesApi } from '@/utils/api';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import type { HolidayMatchedPackage, DealPackage } from '@/hooks/useRouteMonitoring';
import {
  generateMonthGrid,
  generateYearGrid,
  getTripStatus,
  TripStatus,
  CalendarDay,
  getTripPaletteColor,
} from '@/utils/calendarUtils';
import { MissionInspectorModal } from './MissionInspectorModal';
import { PlaneIcon, UmbrellaIcon, CloseIcon, ChevronRightIcon, RefreshIcon } from '@/components/icons';
import { downloadWholeCalendarIcs } from '@/utils/exportTrip';
import { notify } from '@/utils/notify';
import styles from './Calendar.module.css';

interface CalendarProps {
  trips: Trip[];
  currency?: string;
  onSelectDate?: (date: Date, dateString: string) => void;
  onSelectPackage?: (pkg: HolidayMatchedPackage) => void;
}

export function Calendar({ trips, onSelectDate, onSelectPackage, currency }: CalendarProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const router = useRouter();
  const auth = useOptionalAuth();

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).toUpperCase());
  }, [intlLocale]);

  const miniWeekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [intlLocale]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: 'long' });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)));
  }, [intlLocale]);

  const getStatusLabel = (status: TripStatus) => {
    if (status === 'ACTIVE') return t('calendar.status_active_raw');
    if (status === 'COMPLETED') return t('calendar.status_completed_raw');
    return t('calendar.status_upcoming_raw');
  };
  const userCurrency = currency || (auth?.user?.preferences?.default_currency as string) || 'EUR';
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'ANNUAL' | 'MONTH'>('ANNUAL');
  const [interactionMode, setInteractionMode] = useState<'PLAN' | 'HOLIDAY'>('PLAN');
  const [selectedTripData, setSelectedTripData] = useState<{ trip: Trip; status: TripStatus } | null>(null);
  
  // Anchored popover for planning a trip on an empty day
  const [activePopover, setActivePopover] = useState<{
    date: Date;
    dateString: string;
    x: number;
    y: number;
    isAbove: boolean;
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // User-selected holiday days (synced with DB user preferences + localStorage)
  const serverHolidayKey = useMemo(() => {
    const raw = auth?.user?.preferences?.holiday_dates;
    return Array.isArray(raw) ? JSON.stringify([...raw.map(String)].sort()) : null;
  }, [auth?.user?.preferences?.holiday_dates]);

  const [localHolidaysState, setLocalHolidaysState] = useState<{
    baseServerKey: string | null;
    holidays: Set<string>;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('paladio_user_holidays');
      return stored ? { baseServerKey: null, holidays: new Set(JSON.parse(stored)) } : null;
    } catch {
      return null;
    }
  });

  const serverHolidays = useMemo(() => {
    if (serverHolidayKey === null) return null;
    try {
      return new Set(JSON.parse(serverHolidayKey) as string[]);
    } catch {
      return null;
    }
  }, [serverHolidayKey]);

  const holidays = useMemo(() => {
    if (localHolidaysState && localHolidaysState.baseServerKey === serverHolidayKey) {
      return localHolidaysState.holidays;
    }
    return serverHolidays ?? localHolidaysState?.holidays ?? new Set<string>();
  }, [localHolidaysState, serverHolidayKey, serverHolidays]);

  // Official statutory public holidays (synced from backend)
  const [publicHolidays, setPublicHolidays] = useState<Map<string, string>>(new Map());
  const [publicHolidayCountryName, setPublicHolidayCountryName] = useState<string>('');
  const [isSyncingHolidays, setIsSyncingHolidays] = useState<boolean>(false);

  const homeCountry = auth?.user?.preferences?.home_country as string | undefined;
  const homeCity = auth?.user?.preferences?.home_city as string | undefined;

  const loadPublicHolidays = React.useCallback(async () => {
    setIsSyncingHolidays(true);
    try {
      const qCountry =
        (typeof window !== 'undefined' ? localStorage.getItem('paladio_home_country') : null) ||
        homeCountry ||
        'ES';
      const qCity =
        (typeof window !== 'undefined' ? localStorage.getItem('paladio_home_city') : null) ||
        homeCity ||
        '';
      const params = new URLSearchParams({ year: String(year) });
      if (qCountry) params.set('country', qCountry);
      if (qCity) params.set('city', qCity);

      const res = await apiFetch<{
        country: string;
        country_name?: string;
        year: number;
        holidays: Array<{ date: string; name: string }>;
      }>(`/calendar/holidays?${params.toString()}`);

      if (res && Array.isArray(res.holidays)) {
        const map = new Map<string, string>();
        res.holidays.forEach((h) => {
          map.set(h.date, h.name);
        });
        setPublicHolidays(map);
        if (res.country_name) setPublicHolidayCountryName(res.country_name);
      }
    } catch {
      // Quiet fail on network or backend unavailability
    } finally {
      setIsSyncingHolidays(false);
    }
  }, [year, homeCountry, homeCity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPublicHolidays();
    }, 0);

    const handleLocationChange = () => {
      void loadPublicHolidays();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('paladio_home_location_changed', handleLocationChange);
      window.addEventListener('storage', handleLocationChange);
    }
    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('paladio_home_location_changed', handleLocationChange);
        window.removeEventListener('storage', handleLocationChange);
      }
    };
  }, [loadPublicHolidays]);

  // Deal packages matching user's marked vacation windows & public holidays
  const [holidayPackages, setHolidayPackages] = useState<HolidayMatchedPackage[]>([]);

  useEffect(() => {
    let isCancelled = false;
    async function loadHolidayMatches() {
      const combinedHolidays = new Set([
        ...Array.from(holidays),
        ...Array.from(publicHolidays.keys()),
      ]);
      if (combinedHolidays.size === 0) {
        setHolidayPackages([]);
        return;
      }
      try {
        const matches = await apiFetch<HolidayMatchedPackage[]>(
          `/market/holiday-matches?currency=${userCurrency}`,
          {
            method: 'POST',
            body: JSON.stringify({
              holiday_dates: Array.from(combinedHolidays),
              pricing: 'package',
              currency: userCurrency,
            }),
          }
        );
        if (!isCancelled && Array.isArray(matches)) {
          setHolidayPackages(matches);
        }
      } catch {
        if (!isCancelled) setHolidayPackages([]);
      }
    }
    loadHolidayMatches();
    return () => {
      isCancelled = true;
    };
  }, [holidays, publicHolidays, userCurrency]);

  // Index packages by depart date for fast calendar cell lookup
  const holidayPackagesByDepartDate = useMemo(() => {
    const map: Record<string, HolidayMatchedPackage[]> = {};
    holidayPackages.forEach((pkg) => {
      if (!map[pkg.depart_date]) {
        map[pkg.depart_date] = [];
      }
      map[pkg.depart_date].push(pkg);
    });
    return map;
  }, [holidayPackages]);

  // 3 best deals of each monitored route
  const [monitoredDeals, setMonitoredDeals] = useState<DealPackage[]>([]);

  useEffect(() => {
    let isCancelled = false;
    async function loadMonitoredDeals() {
      try {
        const deals = await apiFetch<DealPackage[]>(
          `/market/routes-best-deals?limit_per_route=3&currency=${userCurrency}`
        );
        if (!isCancelled && Array.isArray(deals)) {
          setMonitoredDeals(deals);
        }
      } catch {
        if (!isCancelled) setMonitoredDeals([]);
      }
    }
    loadMonitoredDeals();
    return () => {
      isCancelled = true;
    };
  }, [userCurrency]);

  // Index monitored deals by depart date for fast calendar cell lookup
  const monitoredDealsByDepartDate = useMemo(() => {
    const map: Record<string, DealPackage[]> = {};
    monitoredDeals.forEach((deal) => {
      if (!deal.flight || !deal.return_flight) return;
      if (!map[deal.depart_date]) {
        map[deal.depart_date] = [];
      }
      map[deal.depart_date].push(deal);
    });
    return map;
  }, [monitoredDeals]);

  const handleDealClick = (e: React.MouseEvent, deal: DealPackage) => {
    e.stopPropagation();
    router.push(`/monitoring?route=${deal.alert_id}`);
  };

  const saveHolidays = (nextHolidays: Set<string>) => {
    setLocalHolidaysState({ baseServerKey: serverHolidayKey, holidays: nextHolidays });
    const arr = Array.from(nextHolidays).sort();
    const serialized = JSON.stringify(arr);
    try {
      localStorage.setItem('paladio_user_holidays', serialized);
    } catch {
      // Ignore storage errors
    }
    if (auth?.user) {
      void updatePreferencesApi({
        ...(auth.user.preferences || {}),
        holiday_dates: arr,
      })
        .then(() => auth.refreshUser())
        .catch(() => {});
    }
  };

  // Month grid for focused month view
  const days: CalendarDay[] = useMemo(() => {
    return generateMonthGrid(year, month, trips, holidays, publicHolidays);
  }, [year, month, trips, holidays, publicHolidays]);

  // Year grid for 12-month panoramic view
  const yearMonths = useMemo(() => {
    return generateYearGrid(year, trips, holidays, publicHolidays);
  }, [year, trips, holidays, publicHolidays]);

  // Map trips to colors for legend and chips
  const tripsWithPalette = useMemo(() => {
    return trips.map((t, idx) => ({
      trip: t,
      color: getTripPaletteColor(t, idx),
      status: getTripStatus(t),
    }));
  }, [trips]);

  const holidayDaysYear = useMemo(() => {
    return Array.from(holidays).filter((d) => d.startsWith(`${year}-`)).length;
  }, [year, holidays]);

  const handlePrev = () => {
    setActivePopover(null);
    if (viewMode === 'ANNUAL') {
      setCurrentDate(new Date(year - 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const handleNext = () => {
    setActivePopover(null);
    if (viewMode === 'ANNUAL') {
      setCurrentDate(new Date(year + 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  const handleToday = () => {
    setActivePopover(null);
    setCurrentDate(new Date());
  };

  const handleClearYearHolidays = () => {
    const nextHolidays = new Set(Array.from(holidays).filter((d) => !d.startsWith(`${year}-`)));
    saveHolidays(nextHolidays);
  };

  const handleCellClick = (
    e: React.MouseEvent<HTMLElement>,
    day: CalendarDay
  ) => {
    // In Holiday Mode: toggle holiday on open days
    if (interactionMode === 'HOLIDAY') {
      // Disallow turning trip days into holidays to prevent collision
      if (day.trips.length > 0) {
        return;
      }
      // Official public holidays cannot be removed
      if (day.isPublicHoliday || publicHolidays.has(day.dateString)) {
        notify.info(
          t('calendar.official_holiday_title'),
          t('calendar.official_holiday_cannot_remove', {
            name: day.publicHolidayName || t('calendar.this_holiday'),
          })
        );
        return;
      }
      const nextHolidays = new Set(holidays);
      if (nextHolidays.has(day.dateString)) {
        nextHolidays.delete(day.dateString);
      } else {
        nextHolidays.add(day.dateString);
      }
      saveHolidays(nextHolidays);
      return;
    }

    // In Plan Trips Mode:
    if (day.trips.length > 0) {
      const primary = day.trips[0];
      setSelectedTripData({ trip: primary.trip, status: primary.status });
      setActivePopover(null);
    } else {
      // Anchored popover asking to plan trip on this date
      const rect = e.currentTarget.getBoundingClientRect();
      const isAbove = rect.top > 230;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130);
      const y = isAbove ? rect.top - 8 : rect.bottom + 8;
      setActivePopover({
        date: day.date,
        dateString: day.dateString,
        x,
        y,
        isAbove,
      });
    }
  };

  const handleConfirmPlanTrip = () => {
    if (activePopover && onSelectDate) {
      onSelectDate(activePopover.date, activePopover.dateString);
    }
    setActivePopover(null);
  };

  return (
    <div className={`${styles.wrapper} ${interactionMode === 'HOLIDAY' ? styles.holidayPaintingActive : ''}`}>
      {/* Main Calendar Card */}
      <div className={styles.calendarCard}>
        {/* Header Controls: Navigation, View Toggle, Mode Toggle */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.monthTitle}>
              {viewMode === 'ANNUAL'
                ? t('calendar.annual_dispatch_title', { year })
                : t('calendar.month_year_title', { month: monthNames[month], year })}
            </h2>
            <div className={styles.navButtons}>
              <button
                type="button"
                onClick={handlePrev}
                className={styles.calIconBtn}
                title={viewMode === 'ANNUAL' ? t('calendar.prev_year') : t('calendar.prev_month')}
                aria-label={viewMode === 'ANNUAL' ? t('calendar.prev_year') : t('calendar.prev_month')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNext}
                className={styles.calIconBtn}
                title={viewMode === 'ANNUAL' ? t('calendar.next_year') : t('calendar.next_month')}
                aria-label={viewMode === 'ANNUAL' ? t('calendar.next_year') : t('calendar.next_month')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={handleToday}
              className={styles.ghostTodayBtn}
              title={t('calendar.jump_to_today')}
              aria-label={t('calendar.today')}
            >
              {t('calendar.today')}
            </button>
          </div>

          {/* Control Clusters: Export, View Switcher & Mode Switcher */}
          <div className={styles.controlsCluster}>
            <button
              type="button"
              onClick={() => {
                const count = downloadWholeCalendarIcs({
                  trips,
                  holidays,
                  publicHolidays,
                  monitoredDeals,
                  calendarName: t('calendar.export_calendar_name'),
                });
                if (count === 0) {
                  notify.info(t('calendar.empty_title'), t('calendar.empty_export_msg'));
                } else {
                  notify.success(
                    t('calendar.exported_title'),
                    count === 1
                      ? t('calendar.exported_singular')
                      : t('calendar.exported_plural', { count })
                  );
                }
              }}
              className={styles.exportIcsBtn}
              title={t('calendar.export_ics_title')}
              aria-label={t('calendar.export_ics_aria')}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('calendar.export_ics_btn')}
            </button>

            {/* View Mode Toggle: Annual vs Month */}
            <div className={styles.segmentedGroup}>
              <button
                type="button"
                onClick={() => {
                  setViewMode('ANNUAL');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${viewMode === 'ANNUAL' ? styles.segmentedBtnActive : ''}`}
                aria-label={t('calendar.annual_view_aria')}
              >
                <span>⊞</span> {t('calendar.annual_view_btn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('MONTH');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${viewMode === 'MONTH' ? styles.segmentedBtnActive : ''}`}
                aria-label={t('calendar.month_view_aria')}
              >
                <span>▤</span> {t('calendar.month_view_btn')}
              </button>
            </div>

            {/* Interaction Mode Toggle: Plan Trips vs Mark Holidays */}
            <div className={styles.segmentedGroup}>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('PLAN');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${interactionMode === 'PLAN' ? styles.segmentedBtnActive : ''}`}
                aria-label={t('calendar.plan_mode_aria')}
              >
                <PlaneIcon size={13} style={{ marginRight: '5px' }} /> {t('calendar.plan_mode_btn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode((prev) => (prev === 'HOLIDAY' ? 'PLAN' : 'HOLIDAY'));
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${interactionMode === 'HOLIDAY' ? styles.holidayBtnActive : ''}`}
                aria-label={t('calendar.holiday_mode_aria')}
              >
                <UmbrellaIcon size={13} style={{ marginRight: '5px' }} /> {t('calendar.mark_holidays_btn', { count: holidayDaysYear })}
              </button>
            </div>
          </div>
        </div>

        {/* Holiday Mode Active Banner */}
        {interactionMode === 'HOLIDAY' && (
          <div className={styles.holidayBanner}>
            <div className={styles.holidayBannerText}>
              <span className={styles.holidayBannerDot} />
              <span>
                <strong>{t('calendar.holiday_mode_active_prefix')}</strong>{' '}
                {t('calendar.holiday_mode_active_body', {
                  country: publicHolidayCountryName || t('calendar.local_country'),
                })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={loadPublicHolidays}
                disabled={isSyncingHolidays}
                className={styles.clearHolidaysBtn}
                title={t('calendar.sync_holidays_title')}
              >
                <RefreshIcon size={11} className={isSyncingHolidays ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                {isSyncingHolidays
                  ? t('calendar.syncing')
                  : t('calendar.sync_country_holidays', {
                      target: publicHolidayCountryName || t('calendar.holidays_fallback'),
                    })}
              </button>
              {holidayDaysYear > 0 && (
                <button
                  type="button"
                  onClick={handleClearYearHolidays}
                  className={styles.clearHolidaysBtn}
                >
                  {t('calendar.clear_year_pto', { year })}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Palette Legend Bar */}
        <div className={styles.paletteLegend}>
          <span className={styles.legendLabel}>{t('calendar.palette_label')}</span>
          <div className={styles.legendChipsList}>
            {tripsWithPalette.map(({ trip, color, status }) => (
              <div
                key={trip.id || `${trip.destination}-${trip.start_date}`}
                className={styles.tripLegendChip}
                onClick={() => setSelectedTripData({ trip, status })}
                title={t('calendar.trip_legend_title', {
                  destination: trip.destination,
                  status: getStatusLabel(status),
                })}
              >
                <span
                  className={styles.legendColorSwatch}
                  style={{ background: color.bg }}
                />
                <span>{trip.destination}</span>
              </div>
            ))}
            {publicHolidays.size > 0 && (
              <div
                className={styles.tripLegendChip}
                style={{ cursor: 'default' }}
                title={t('calendar.public_holidays_legend_title', {
                  count: publicHolidays.size,
                  country: publicHolidayCountryName || t('calendar.configured_country'),
                })}
              >
                <span className={styles.publicHolidaySwatch} />
                <span>{t('calendar.public_holidays_count', { count: publicHolidays.size })}</span>
              </div>
            )}
            <div
              className={`${styles.tripLegendChip} ${interactionMode === 'HOLIDAY' ? styles.holidayChipActive : ''}`}
              onClick={() => {
                setInteractionMode((prev) => (prev === 'HOLIDAY' ? 'PLAN' : 'HOLIDAY'));
                setActivePopover(null);
              }}
              title={t('calendar.holiday_chip_title')}
              style={{ cursor: 'pointer' }}
            >
              <span className={styles.holidaySwatch} />
              <span>{t('calendar.holiday_pto_count', { count: holidayDaysYear })}</span>
            </div>
            {monitoredDeals.length > 0 && (
              <div
                className={styles.tripLegendChip}
                onClick={() => router.push('/monitoring')}
                style={{
                  borderColor: '#D97706',
                  borderStyle: 'dashed',
                  borderWidth: '1.5px',
                  background: '#FEF3C7',
                  color: '#92400E',
                  cursor: 'pointer',
                }}
                title={t('calendar.monitored_deals_legend_title', { count: monitoredDeals.length })}
              >
                <span
                  className={styles.legendColorSwatch}
                  style={{ background: '#F59E0B', border: '1px dashed #D97706' }}
                />
                <span>{t('calendar.monitored_deals_count', { count: monitoredDeals.length })}</span>
              </div>
            )}
            {/* Status Legend indicators for backward compatibility */}
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={`${styles.legendColorSwatch} ${styles.legendActive}`} style={{ background: 'var(--color-ocean, #1B8FA6)' }} />
              <span>{t('calendar.legend_active')}</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'rgba(124, 196, 209, 0.4)', border: '1px solid var(--color-sky, #7CC4D1)' }} />
              <span>{t('calendar.legend_queued')}</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'rgba(75, 102, 112, 0.3)' }} />
              <span>{t('calendar.legend_archived')}</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'var(--color-sun, #D42A2F)', borderRadius: '50%' }} />
              <span>{t('calendar.legend_current_day')}</span>
            </div>
          </div>
        </div>

        {/* VIEW MODE 1: 12-Month Panoramic Annual Grid */}
        {viewMode === 'ANNUAL' ? (
          <div className={styles.annualGrid}>
            {yearMonths.map((m) => {
              const localizedMonthName = monthNames[m.month] || m.monthName;
              return (
              <div key={m.month} className={styles.miniMonthCard}>
                <div className={styles.miniMonthHeader}>
                  <span className={styles.miniMonthTitle}>{localizedMonthName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate(new Date(year, m.month, 1));
                      setViewMode('MONTH');
                    }}
                    className={styles.miniMonthFocusBtn}
                    title={t('calendar.focus_on_month', { month: localizedMonthName })}
                    aria-label={t('calendar.focus_on_month', { month: localizedMonthName })}
                  >
                    {t('calendar.focus_btn')} <ChevronRightIcon size={10} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }} />
                  </button>
                </div>

                <div className={styles.miniWeekdaysRow}>
                  {miniWeekdayNames.map((name, i) => (
                    <div key={`${name}-${i}`} className={styles.miniWeekdayCol}>
                      {name}
                    </div>
                  ))}
                </div>

                <div className={styles.miniDaysGrid}>
                  {m.days.map((day) => {
                    const hasTrips = day.trips.length > 0;
                    const dayMonitoredDeals = monitoredDealsByDepartDate[day.dateString] || [];
                    const cellClasses = [
                      styles.miniDayCell,
                      !day.isCurrentMonth ? styles.miniDayCellOutside : '',
                      day.isPast ? styles.miniDayCellPast : '',
                      day.isToday ? styles.miniDayCellToday : '',
                      day.isPublicHoliday ? styles.miniDayCellPublicHoliday : day.isHoliday ? styles.miniDayCellHoliday : '',
                    ].filter(Boolean).join(' ');

                    const title = hasTrips
                      ? t('calendar.trip_day_title', {
                          destination: day.trips[0].trip.destination,
                          status: getStatusLabel(day.trips[0].status),
                        })
                      : dayMonitoredDeals.length > 0
                      ? t('calendar.mini_monitored_deal_title', {
                          origin: dayMonitoredDeals[0].origin_name || dayMonitoredDeals[0].origin_iata,
                          destination: dayMonitoredDeals[0].destination_name || dayMonitoredDeals[0].destination_code,
                          price: formatCurrencyAmount(dayMonitoredDeals[0].total_price_eur, dayMonitoredDeals[0].currency || userCurrency, { maximumFractionDigits: 0 }),
                          discount: dayMonitoredDeals[0].discount_pct > 0 ? ` (-${Math.round(dayMonitoredDeals[0].discount_pct)}%)` : '',
                        })
                      : day.isPublicHoliday
                      ? t('calendar.public_holiday_on_date', {
                          name: day.publicHolidayName || t('calendar.official_holiday_fallback'),
                          date: day.dateString,
                        })
                      : day.isHoliday
                      ? t('calendar.holiday_pto_on_date', { date: day.dateString })
                      : interactionMode === 'HOLIDAY'
                      ? t('calendar.click_to_mark_holiday', { date: day.dateString })
                      : t('calendar.click_to_plan_trip', { date: day.dateString });

                    return (
                      <div
                        key={day.dateString}
                        onClick={(e) => day.isCurrentMonth && handleCellClick(e, day)}
                        className={cellClasses}
                        title={title}
                      >
                        <span className={styles.miniDayNum}>{day.dayNumber}</span>
                        {hasTrips && (
                          <div
                            className={styles.miniTripIndicator}
                            style={{
                              background: day.trips[0].color?.bg || 'var(--color-ocean)',
                            }}
                          />
                        )}
                        {dayMonitoredDeals.length > 0 ? (
                          <div
                            className={styles.miniMonitoredDealBadge}
                            onClick={(e) => handleDealClick(e, dayMonitoredDeals[0])}
                            title={t('calendar.mini_monitored_deal_badge_title', {
                              origin: dayMonitoredDeals[0].origin_iata,
                              destination: dayMonitoredDeals[0].destination_code,
                              price: formatCurrencyAmount(dayMonitoredDeals[0].total_price_eur, dayMonitoredDeals[0].currency || userCurrency, { maximumFractionDigits: 0 }),
                              discount: dayMonitoredDeals[0].discount_pct > 0 ? ` (-${Math.round(dayMonitoredDeals[0].discount_pct)}%)` : '',
                            })}
                          >
                            <span>✈</span>
                            <span>{dayMonitoredDeals[0].destination_code}</span>
                          </div>
                        ) : holidayPackagesByDepartDate[day.dateString]?.length > 0 ? (
                          <div
                            className={styles.miniDealIndicator}
                            style={{ background: '#F59E0B' }}
                            title={t('calendar.matching_deal_title', {
                              origin: holidayPackagesByDepartDate[day.dateString][0].origin_iata,
                              destination: holidayPackagesByDepartDate[day.dateString][0].destination_code,
                              price: formatCurrencyAmount(holidayPackagesByDepartDate[day.dateString][0].total_price_eur, holidayPackagesByDepartDate[day.dateString][0].currency || userCurrency, { maximumFractionDigits: 0 }),
                            })}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          /* VIEW MODE 2: Month Focus View */
          <>
            {/* Weekday Headers */}
            <div className={styles.weekdaysRow}>
              {weekdayNames.map((name, i) => (
                <div key={`${name}-${i}`} className={styles.weekdayCol}>
                  {name}
                </div>
              ))}
            </div>

            {/* 7-Day Month Grid */}
            <div className={styles.grid}>
              {days.map((day, i) => {
                const isMonday = i % 7 === 0;
                const isSunday = (i + 1) % 7 === 0;

                const cellClasses = [
                  styles.dayCell,
                  !day.isCurrentMonth ? styles.dayCellOutside : '',
                  day.isPast ? styles.dayCellPast : '',
                  day.isToday ? styles.dayCellToday : '',
                  day.isPublicHoliday ? styles.dayCellPublicHoliday : day.isHoliday ? styles.dayCellHoliday : '',
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={day.dateString}
                    onClick={(e) => handleCellClick(e, day)}
                    className={cellClasses}
                    title={
                      day.trips.length > 0
                        ? t('calendar.trip_day_title', {
                            destination: day.trips[0].trip.destination,
                            status: getStatusLabel(day.trips[0].status),
                          })
                        : day.isPublicHoliday
                        ? t('calendar.public_holiday_on_date', {
                            name: day.publicHolidayName || t('calendar.official_statutory_holiday_fallback'),
                            date: day.dateString,
                          })
                        : day.isHoliday
                        ? t('calendar.holiday_pto_on_date', { date: day.dateString })
                        : t('calendar.click_to_plan_mission', { date: day.dateString })
                    }
                  >
                    {/* Cell Header: Day Number and optional Holiday badge */}
                    <div className={styles.cellTop}>
                      <span className={styles.dateNum}>{day.dayNumber}</span>
                      {day.isPublicHoliday ? (
                        <span className={styles.publicHolidayBadge} title={day.publicHolidayName || t('calendar.public_holiday_label')}>
                          {day.publicHolidayName ? day.publicHolidayName.slice(0, 12).toUpperCase() : t('calendar.holiday_badge')}
                        </span>
                      ) : day.isHoliday ? (
                        <span className={styles.holidayBadge}>{t('calendar.holiday_badge')}</span>
                      ) : null}
                    </div>

                    {/* Spanning Multi-Day Trip Bars with palette colors */}
                    <div className={styles.barsContainer}>
                      {day.trips.map(({ trip, status, color, isStart, isEnd }, tripIdx) => {
                        let spanClass = styles.spanMid;
                        if (isStart && isEnd) {
                          spanClass = styles.spanSingle;
                        } else if (isStart || isMonday) {
                          spanClass = isEnd ? styles.spanSingle : styles.spanStart;
                        } else if (isEnd || isSunday) {
                          spanClass = styles.spanEnd;
                        }

                        return (
                          <div
                            key={trip.id || tripIdx}
                            className={`${styles.tripSpanBar} ${spanClass}`}
                            style={{
                              ['--trip-bg' as string]: color?.bg || 'var(--color-ocean)',
                              ['--trip-border' as string]: color?.border || '#147589',
                              ['--trip-text' as string]: color?.text || '#FFFFFF',
                            } as React.CSSProperties}
                            title={t('calendar.trip_day_title', {
                              destination: trip.destination,
                              status: getStatusLabel(status),
                            })}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTripData({ trip, status });
                            }}
                          >
                            {isStart || isMonday ? (
                              <span>{trip.destination}</span>
                            ) : (
                              <span>&nbsp;</span>
                            )}
                          </div>
                        );
                      })}

                      {/* Top 3 Best Deals of Each Monitored Route */}
                      {monitoredDealsByDepartDate[day.dateString]?.map((deal) => (
                        <div
                          key={deal.id || `${deal.alert_id}-${deal.depart_date}`}
                          className={styles.monitoredDealBar}
                          title={t('calendar.month_monitored_deal_title', {
                            origin: deal.origin_name || deal.origin_iata,
                            destination: deal.destination_name || deal.destination_code,
                            nights: deal.nights,
                            price: formatCurrencyAmount(deal.total_price_eur, deal.currency || userCurrency, { maximumFractionDigits: 0 }),
                            discount: deal.discount_pct > 0 ? ` (-${Math.round(deal.discount_pct)}%)` : '',
                            depart: deal.depart_date,
                            returnDate: deal.return_date,
                          })}
                          onClick={(e) => handleDealClick(e, deal)}
                        >
                          <div className={styles.monitoredDealRoute}>
                            <span className={styles.monitoredDealTag}>{t('calendar.deal_tag')}</span>
                            <span>✈ {deal.destination_code || deal.destination_name}</span>
                          </div>
                          <span className={styles.monitoredDealPrice}>
                            {formatCurrencyAmount(deal.total_price_eur, deal.currency || userCurrency, { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ))}

                      {/* Monitored Route Deals matching this holiday window */}
                      {holidayPackagesByDepartDate[day.dateString]?.map((pkg) => (
                        <div
                          key={`${pkg.route_id}-${pkg.depart_date}-${pkg.return_date}`}
                          className={styles.holidayPackageBar}
                          title={t('calendar.holiday_package_title', {
                            origin: pkg.origin_iata,
                            destination: pkg.destination_code,
                            nights: pkg.nights,
                            price: formatCurrencyAmount(pkg.total_price_eur, pkg.currency || userCurrency, { maximumFractionDigits: 0 }),
                            depart: pkg.depart_date,
                            returnDate: pkg.return_date,
                          })}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectPackage) {
                              onSelectPackage(pkg);
                            } else {
                              router.push(`/monitoring?route=${pkg.route_id}`);
                            }
                          }}
                        >
                          <span style={{ marginRight: 4, opacity: 0.85 }}>{t('calendar.deal_bracket_tag')}</span>
                          <span>
                            {t('calendar.deal_bar_label', {
                              code: pkg.destination_code,
                              price: formatCurrencyAmount(pkg.total_price_eur, pkg.currency || userCurrency, { maximumFractionDigits: 0 }),
                              nights: pkg.nights,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Anchored Day Planning Popover Box */}
      {activePopover && (
        <>
          <div
            className={styles.popoverOverlay}
            onClick={() => setActivePopover(null)}
          />
          <div
            className={styles.dayPopover}
            style={{
              left: `${activePopover.x}px`,
              top: `${activePopover.y}px`,
              transform: activePopover.isAbove
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
            }}
          >
            <div className={styles.popoverHeader}>
              <span className={styles.popoverTelemetry}>
                <span aria-hidden="true">{'// '}</span>{t('calendar.plan_mission_tag')}
              </span>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className={styles.popoverCloseBtn}
                aria-label={t('common.close')}
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <h4 className={styles.popoverDateTitle}>{activePopover.dateString}</h4>
            <p className={styles.popoverPrompt}>
              {t('calendar.plan_mission_prompt')}
            </p>
            <div className={styles.popoverActions}>
              <button
                type="button"
                onClick={handleConfirmPlanTrip}
                className={styles.popoverPrimaryBtn}
              >
                {t('calendar.plan_trip_btn')}
              </button>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className={styles.popoverCancelBtn}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Mission Inspector Modal */}
      <MissionInspectorModal
        isOpen={selectedTripData !== null}
        trip={selectedTripData?.trip || null}
        status={selectedTripData?.status || 'UPCOMING'}
        onClose={() => setSelectedTripData(null)}
      />
    </div>
  );
}
