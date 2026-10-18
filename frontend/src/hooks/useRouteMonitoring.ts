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

export interface RouteHistory {
  points: HistoryPoint[];
  p10_deal_eur: number | null;
  p50_median_eur: number | null;
  p90_peak_eur: number | null;
  lowest_ever_eur: number | null;
  currency: string;
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
}

export interface RouteStats {
  current_price_eur: number | null;
  current_percentile: number | null;
  p10_deal_eur: number | null;
  p50_median_eur: number | null;
  p90_peak_eur: number | null;
  lowest_ever_eur: number | null;
  lowest_ever_date: string | null;
  total_observations: number;
  landed_fee_ratio: number;
  next_scan_minutes: number;
  itinerary_realism_score: number | null;
  deal_savings_eur: number | null;
  deal_savings_pct: number | null;
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

export function useRouteMonitoring() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [stats, setStats] = useState<RouteStats | null>(null);
  const [history, setHistory] = useState<RouteHistory | null>(null);
  const [calendar, setCalendar] = useState<RouteCalendar | null>(null);
  const [events, setEvents] = useState<RouteEvent[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch summary and routes
  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sumData, routesData] = await Promise.all([
        apiFetch<MarketSummary>('/market/summary'),
        apiFetch<RouteItem[]>('/market/routes'),
      ]);
      setSummary(sumData);
      setRoutes(routesData);
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
        apiFetch<RouteCalendar>(`/market/routes/${routeId}/calendar?months=${monthsCount}`),
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

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [sumData, routesData] = await Promise.all([
          apiFetch<MarketSummary>('/market/summary'),
          apiFetch<RouteItem[]>('/market/routes'),
        ]);
        if (!isMounted) return;
        setSummary(sumData);
        setRoutes(routesData);
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

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || null;

  return {
    routes,
    summary,
    selectedRoute,
    selectedRouteId,
    stats,
    history,
    calendar,
    events,
    isLoading,
    isScanning,
    error,
    selectRoute,
    createRoute,
    toggleRouteActive,
    deleteRoute,
    triggerScan,
    fetchOverview,
    fetchRouteDetail,
  };
}

function loggerError(msg: string, err: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(msg, err);
  }
}
