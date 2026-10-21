"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/utils/api';

export interface RouteItem {
  id: string;
  origin_iata: string;
  destination_code: string;
  destination_name: string;
  earliest_date: string;
  latest_date: string;
  min_nights: number;
  max_nights: number;
  max_budget_eur: number;
  currency: string;
  is_active: boolean;
  schedule: string;
  status: 'DEAL' | 'ACTIVE' | 'PAUSED' | 'PENDING';
  current_price_eur: number | null;
  baseline_p50_eur: number | null;
  baseline_p10_eur: number | null;
  lowest_ever_eur: number | null;
  discount_pct: number | null;
  last_scanned_at: string | null;
  ticks_count: number;
  verdict?: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | null;
  verdict_percentile?: number | null;
  verdict_confidence?: 'building' | 'provisional' | 'established' | null;
  corpus_status?: 'building' | 'ready' | 'failed' | null;
}

export interface MarketSummary {
  monitored_routes: number;
  deals_detected: number;
  ticks_scanned_today: number;
  avg_savings_pct: number;
}

export interface HistoryPoint {
  date: string;
  timestamp: string;
  min_price_eur: number;
  median_price_eur: number;
  ticks_count: number;
  carrier: string;
}

export interface ForwardPricePoint {
  depart_date: string;
  price_eur: number;
  price_return_eur?: number | null;
  verdict: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | null;
  percentile: number | null;
  carrier: string | null;
  return_carrier?: string | null;
}

export interface CorpusInfo {
  status: 'building' | 'ready' | 'failed';
  confidence: 'building' | 'provisional' | 'established';
  ticks_ingested: number;
  depart_dates_count: number;
  min_price_eur: number | null;
  max_price_eur: number | null;
  median_price_eur: number | null;
  last_backfill_at: string | null;
}

export interface PriceVerdictInfo {
  verdict: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK';
  percentile: number;
  vs_median_pct: number;
  price_eur: number;
  baseline_p10_eur: number | null;
  baseline_p25_eur: number | null;
  baseline_p50_eur: number | null;
  baseline_p75_eur: number | null;
  baseline_p90_eur: number | null;
  confidence: 'building' | 'provisional' | 'established';
  explanation: string;
}

export interface RouteHistory {
  points: HistoryPoint[];
  return_points?: HistoryPoint[];
  forward_curve?: ForwardPricePoint[];
  p10_deal_eur: number | null;
  p25_eur?: number | null;
  p50_median_eur: number | null;
  p75_eur?: number | null;
  p90_peak_eur: number | null;
  inbound_p10_deal_eur?: number | null;
  inbound_p50_median_eur?: number | null;
  inbound_p90_peak_eur?: number | null;
  lowest_ever_eur: number | null;
  verdict?: PriceVerdictInfo | null;
  corpus?: CorpusInfo | null;
  currency: string;
}

export interface FlightSummary {
  carrier: string | null;
  flight_number: string | null;
  duration_mins: number | null;
  departure_time: string | null;
  booking_url: string | null;
  price_eur: number | null;
}

export interface LodgingSummary {
  nights: number;
  price_per_night_eur: number;
  total_lodging_eur: number;
}

export interface CalendarDay {
  date: string;
  day: number;
  weekday: number;
  price_eur: number | null;
  price_tier: 'deal' | 'fair' | 'standard' | 'peak' | 'no_data';
  carrier: string | null;
  flight_number: string | null;
  duration_mins: number | null;
  departure_time: string | null;
  booking_url: string | null;
  is_holiday: boolean;
  nights?: number | null;
  return_date?: string | null;
  outbound_flight?: FlightSummary | null;
  return_flight?: FlightSummary | null;
  lodging?: LodgingSummary | null;
}

export interface CalendarMonth {
  year: number;
  month: number;
  month_name: string;
  days: CalendarDay[];
}

export interface RouteCalendar {
  months: CalendarMonth[];
  route_label: string;
  p10_deal_eur: number | null;
  p50_median_eur: number | null;
  p90_peak_eur?: number | null;
  view?: 'outbound' | 'inbound' | 'roundtrip';
  pricing?: 'flights' | 'package';
  top_dates?: string[];
}

export interface HolidayMatchedPackage {
  route_id: string;
  origin_iata: string;
  destination_code: string;
  destination_name: string;
  depart_date: string;
  return_date: string;
  nights: number;
  total_price_eur: number;
  price_tier: string;
  pricing: string;
  outbound_flight: FlightSummary;
  return_flight: FlightSummary;
  lodging?: LodgingSummary | null;
}

export interface RouteStats {
  current_price_eur: number | null;
  current_percentile: number | null;
  p10_deal_eur: number | null;
  p25_eur?: number | null;
  p50_median_eur: number | null;
  p75_eur?: number | null;
  p90_peak_eur: number | null;
  lowest_ever_eur: number | null;
  lowest_ever_date: string | null;
  total_observations: number;
  landed_fee_ratio: number;
  next_scan_minutes: number;
  itinerary_realism_score: number | null;
  deal_savings_eur: number | null;
  deal_savings_pct: number | null;
  verdict?: 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | null;
  verdict_confidence?: 'building' | 'provisional' | 'established' | null;
  corpus_status?: 'building' | 'ready' | 'failed' | null;
  depart_dates_count?: number | null;
}

export interface RouteEvent {
  id: string;
  event_type: string;
  title: string;
  result: string;
  timestamp: string;
  details: string;
  booking_url?: string | null;
}

export interface DealFlight {
  airline: string;
  flight_number?: string | null;
  depart_time: string;
  arrival_time: string;
  base_price_eur: number;
  landed_price_eur: number;
  booking_url?: string | null;
  source?: string;
  is_live?: boolean;
  ancillaries_excluded?: boolean;
}

export interface DealLodging {
  property_name: string;
  nightly_base_eur: number;
  landed_total_eur: number;
  quality_score?: number | null;
  stars?: number | null;
  review_score?: number | null;
  review_count?: number | null;
  booking_url?: string | null;
  source?: string;
  is_live?: boolean;
  taxes_included?: boolean;
}

export interface ProviderHealth {
  provider: string;
  asset_type: string;
  status: string;
  last_ok_at?: string | null;
  failure_count: number;
  consecutive_failures: number;
  last_error?: string | null;
  updated_at: string;
}

export interface DealPackage {
  id: string;
  alert_id: string;
  candidate_id: string;
  origin_iata: string;
  destination_code: string;
  origin_name: string;
  destination_name: string;
  depart_date: string;
  return_date: string;
  nights: number;
  total_price_eur: number;
  baseline_median_eur: number;
  savings_eur: number;
  discount_pct: number;
  package_ratio: number;
  realism_score: number;
  status: string;
  detected_at: string;
  flight: DealFlight;
  lodging: DealLodging;
}

export function useRouteMonitoring() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [deals, setDeals] = useState<DealPackage[]>([]);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [stats, setStats] = useState<RouteStats | null>(null);
  const [history, setHistory] = useState<RouteHistory | null>(null);
  const [calendar, setCalendar] = useState<RouteCalendar | null>(null);
  const [events, setEvents] = useState<RouteEvent[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch summary and routes
  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sumData, routesData, dealsData] = await Promise.all([
        apiFetch<MarketSummary>('/market/summary'),
        apiFetch<RouteItem[]>('/market/routes'),
        apiFetch<DealPackage[]>('/market/deals'),
      ]);
      const sortedDeals = [...dealsData].sort((a, b) => b.discount_pct - a.discount_pct || a.total_price_eur - b.total_price_eur);
      setSummary(sumData);
      setRoutes(routesData);
      setDeals(sortedDeals);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load route monitoring data';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch detail for selected route
  const fetchRouteDetail = useCallback(async (routeId: string, historyRange = '30d', monthsCount = 4) => {
    try {
      const [sData, hData, cData, eData] = await Promise.all([
        apiFetch<RouteStats>(`/market/routes/${routeId}/stats`),
        apiFetch<RouteHistory>(`/market/routes/${routeId}/history?range=${historyRange}`),
        apiFetch<RouteCalendar>(`/market/routes/${routeId}/calendar?view=roundtrip&pricing=package&months=${monthsCount}`),
        apiFetch<RouteEvent[]>(`/market/routes/${routeId}/events`),
      ]);
      setStats(sData);
      setHistory(hData);
      setCalendar(cData);
      setEvents(eData);
    } catch (err: unknown) {
      loggerError('Failed to fetch route detail', err);
    }
  }, []);

  // Fetch calendar for selected route with specific view and pricing
  const fetchCalendar = useCallback(async (
    routeId?: string,
    view: 'outbound' | 'inbound' | 'roundtrip' = 'roundtrip',
    pricing: 'flights' | 'package' = 'package',
    monthsCount = 4
  ) => {
    const targetId = routeId || selectedRouteId;
    if (!targetId) return;
    try {
      const cData = await apiFetch<RouteCalendar>(
        `/market/routes/${targetId}/calendar?view=${view}&pricing=${pricing}&months=${monthsCount}`
      );
      setCalendar(cData);
    } catch (err: unknown) {
      loggerError('Failed to fetch calendar view', err);
    }
  }, [selectedRouteId]);

  // Fetch packages fitting user's marked vacation/holiday windows
  const fetchHolidayMatches = useCallback(async (
    holidayDates: string[],
    pricing: 'flights' | 'package' = 'package'
  ): Promise<HolidayMatchedPackage[]> => {
    if (!holidayDates || holidayDates.length === 0) return [];
    try {
      const res = await apiFetch<HolidayMatchedPackage[]>('/market/holiday-matches', {
        method: 'POST',
        body: JSON.stringify({ holiday_dates: holidayDates, pricing }),
      });
      return res || [];
    } catch (err: unknown) {
      loggerError('Failed to fetch holiday matches', err);
      return [];
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [sumData, routesData, dealsData] = await Promise.all([
          apiFetch<MarketSummary>('/market/summary'),
          apiFetch<RouteItem[]>('/market/routes'),
          apiFetch<DealPackage[]>('/market/deals'),
        ]);
        if (!isMounted) return;
        const sortedDeals = [...dealsData].sort((a, b) => b.discount_pct - a.discount_pct || a.total_price_eur - b.total_price_eur);
        setSummary(sumData);
        setRoutes(routesData);
        setDeals(sortedDeals);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load route monitoring data';
        setError(msg);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRouteId) return;
    let isMounted = true;
    async function loadRoute() {
      try {
        const [sData, hData, cData, eData] = await Promise.all([
          apiFetch<RouteStats>(`/market/routes/${selectedRouteId}/stats`),
          apiFetch<RouteHistory>(`/market/routes/${selectedRouteId}/history?range=30d`),
          apiFetch<RouteCalendar>(`/market/routes/${selectedRouteId}/calendar?months=4`),
          apiFetch<RouteEvent[]>(`/market/routes/${selectedRouteId}/events`),
        ]);
        if (!isMounted) return;
        setStats(sData);
        setHistory(hData);
        setCalendar(cData);
        setEvents(eData);
      } catch (err: unknown) {
        if (isMounted) {
          loggerError('Failed to fetch route detail', err);
        }
      }
    }
    loadRoute();
    return () => {
      isMounted = false;
    };
  }, [selectedRouteId]);

  const selectRoute = (id: string | null) => {
    setSelectedRouteId(id);
  };

  const createRoute = async (data: {
    origin_iata: string;
    destination_code: string;
    earliest_date: string;
    latest_date: string;
    min_nights: number;
    max_nights: number;
    travelers: number;
    max_budget_eur: number;
  }) => {
    const created = await apiFetch<RouteItem>('/market/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    await fetchOverview();
    setSelectedRouteId(created.id);
    return created;
  };

  const toggleRouteActive = async (id: string, is_active: boolean) => {
    await apiFetch(`/market/routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    });
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active, status: is_active ? 'ACTIVE' : 'PAUSED' } : r))
    );
  };

  const deleteRoute = async (id: string) => {
    await apiFetch(`/market/routes/${id}`, {
      method: 'DELETE',
    });
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    if (selectedRouteId === id) {
      setSelectedRouteId(null);
    }
  };

  const discardDeal = async (dealId: string) => {
    // Optimistically remove from state immediately
    setDeals((prev) => prev.filter((d) => d.id !== dealId));
    try {
      await apiFetch(`/market/deals/${dealId}/discard`, {
        method: 'POST',
      });
      // Refresh summary deal counter
      const sumData = await apiFetch<MarketSummary>('/market/summary');
      setSummary(sumData);
    } catch (err: unknown) {
      loggerError('Failed to discard deal', err);
      await fetchOverview();
    }
  };

  const triggerScan = async (id: string) => {
    setIsScanning(true);
    try {
      await apiFetch(`/market/routes/${id}/scan`, {
        method: 'POST',
      });
      await fetchOverview();
      await fetchRouteDetail(id);
    } finally {
      setIsScanning(false);
    }
  };

  const triggerBackfill = async (id: string) => {
    setIsBackfilling(true);
    try {
      await apiFetch(`/market/routes/${id}/backfill`, {
        method: 'POST',
      });
      await fetchOverview();
      await fetchRouteDetail(id);
    } finally {
      setIsBackfilling(false);
    }
  };

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || null;

  return {
    routes,
    deals,
    summary,
    selectedRoute,
    selectedRouteId,
    stats,
    history,
    calendar,
    events,
    isLoading,
    isScanning,
    isBackfilling,
    error,
    selectRoute,
    createRoute,
    toggleRouteActive,
    deleteRoute,
    discardDeal,
    triggerScan,
    triggerBackfill,
    fetchOverview,
    fetchRouteDetail,
    fetchCalendar,
    fetchHolidayMatches,
  };
}

function loggerError(msg: string, err: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(msg, err);
  }
}
