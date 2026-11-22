'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { apiFetch } from '@/utils/api';
import { Spinner, RefreshIcon, CheckIcon, AlertTriangleIcon, InfoIcon, CompassIcon } from '@/components/icons';
import { WeatherForecastIllustration } from '@/components/illustrations/GeneralAppIllustrations';

export interface WeatherHighlight {
  uv_index: float_or_number;
  uv_status: string;
  wind_speed_kmh: number;
  wind_direction_deg: number;
  wind_direction_cardinal: string;
  sunrise: string;
  sunset: string;
  humidity_pct: number;
  humidity_status: string;
  visibility_km: number;
  visibility_status: string;
  aqi: number;
  aqi_status: string;
}

type float_or_number = number;

export interface WeatherDayForecast {
  date: string;
  day_name: string;
  weather_code: number;
  condition: string;
  icon_type: string;
  temp_max_c: number;
  temp_min_c: number;
  highlights: WeatherHighlight;
}

export interface WeatherForecastResponse {
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current_temp_c: number;
  current_condition: string;
  current_weather_code: number;
  current_icon_type: string;
  forecast_days: WeatherDayForecast[];
  travel_advisory: string;
}

export interface TripWeatherTabProps {
  destinationCity: string;
  tripStartDate?: string;
  tripEndDate?: string;
  selectedDay?: number | 'all';
  onSelectDay?: (day: number | 'all') => void;
  coordinates?: { lat: number; lng: number } | null;
  tripDaysCount?: number;
}

/* -------------------------------------------------------------------------- */
/* Tactical Minimalist Weather SVG Icons                                       */
/* -------------------------------------------------------------------------- */

function WeatherIcon({ type, size = 32 }: { type: string; size?: number }) {
  switch (type) {
    case 'clear':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="7" fill="#E2B33C" />
          <path
            d="M16 3v3m0 20v3M3 16h3m20 0h3m-4.22-8.78l-2.12 2.12m-13.32 13.32l-2.12 2.12m0-17.56l2.12 2.12m13.32 13.32l2.12 2.12"
            stroke="#E2B33C"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'partly-cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="13" cy="12" r="5" fill="#E2B33C" />
          <path
            d="M9 24h13a5 5 0 0 0 1-9.9 6.5 6.5 0 0 0-12.7-1.1A4.5 4.5 0 0 0 9 24z"
            fill="#CBD5E1"
            stroke="#94A3B8"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path
            d="M8 23h15a5 5 0 0 0 1-9.9 6.5 6.5 0 0 0-12.7-1.1A4.5 4.5 0 0 0 8 23z"
            fill="#94A3B8"
            opacity="0.8"
          />
          <path
            d="M6 25h14a4 4 0 0 0 .8-7.9 5.5 5.5 0 0 0-10.8-1A3.5 3.5 0 0 0 6 25z"
            fill="#CBD5E1"
          />
        </svg>
      );
    case 'drizzle':
    case 'rain':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path
            d="M7 19h16a4.5 4.5 0 0 0 .9-8.9A6 6 0 0 0 12.2 9 4 4 0 0 0 7 19z"
            fill="#94A3B8"
          />
          <line x1="10" y1="22" x2="8" y2="27" stroke="#1B8FA6" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="16" y1="22" x2="14" y2="27" stroke="#1B8FA6" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="22" y1="22" x2="20" y2="27" stroke="#1B8FA6" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'snow':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path
            d="M7 19h16a4.5 4.5 0 0 0 .9-8.9A6 6 0 0 0 12.2 9 4 4 0 0 0 7 19z"
            fill="#CBD5E1"
          />
          <circle cx="10" cy="24" r="1.5" fill="#7CC4D1" />
          <circle cx="16" cy="26" r="1.5" fill="#7CC4D1" />
          <circle cx="22" cy="24" r="1.5" fill="#7CC4D1" />
        </svg>
      );
    case 'thunderstorm':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path
            d="M7 18h16a4.5 4.5 0 0 0 .9-8.9A6 6 0 0 0 12.2 8 4 4 0 0 0 7 18z"
            fill="#64748B"
          />
          <path d="M15 19l-3 6h4l-2 5 6-7h-4l2-4h-3z" fill="#E2B33C" />
        </svg>
      );
    case 'fog':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path d="M6 14h20M4 18h24M8 22h16" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Semi-Circle UV Index Arc Gauge                                             */
/* -------------------------------------------------------------------------- */

function UvGauge({ value }: { value: number }) {
  // Semi-circle arc from 180 deg to 360 deg
  // Radius = 44, Center = (54, 52)
  const clampedVal = Math.max(0, Math.min(12, value));
  const progressRatio = clampedVal / 12; // 0 to 1
  const strokeDashoffset = 138.2 - 138.2 * progressRatio;

  const color =
    clampedVal < 3 ? '#1F7A4D' : clampedVal < 6 ? '#E2B33C' : clampedVal < 8 ? '#F59E0B' : '#D42A2F';

  return (
    <div style={{ position: 'relative', width: '108px', height: '62px', margin: '0 auto' }}>
      <svg width="108" height="62" viewBox="0 0 108 62">
        {/* Background Arc */}
        <path
          d="M 10 54 A 44 44 0 0 1 98 54"
          fill="none"
          stroke="var(--color-border-subtle, #E2D9CC)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Progress Arc */}
        <path
          d="M 10 54 A 44 44 0 0 1 98 54"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray="138.2"
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      {/* Scale indicators */}
      <span style={{ position: 'absolute', bottom: '2px', left: '20px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
        0
      </span>
      <span style={{ position: 'absolute', top: '10px', left: '26px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
        6
      </span>
      <span style={{ position: 'absolute', top: '10px', right: '26px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
        9
      </span>
      <span style={{ position: 'absolute', bottom: '2px', right: '10px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
        12
      </span>
      {/* Center value */}
      <div
        style={{
          position: 'absolute',
          bottom: '0px',
          left: '0',
          right: '0',
          textAlign: 'center',
          fontSize: '24px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          lineHeight: 1,
        }}
      >
        {Math.round(value)}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vertical Pill Slider Gauge                                                 */
/* -------------------------------------------------------------------------- */

function VerticalSliderGauge({
  percentage,
  dotColor = 'var(--color-accent-primary)',
}: {
  percentage: number;
  dotColor?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const bottomPos = `${clamped}%`;

  return (
    <div
      style={{
        position: 'relative',
        width: '18px',
        height: '68px',
        borderRadius: '9999px',
        background: 'var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Track fill */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${clamped}%`,
          background: 'rgba(15, 76, 92, 0.15)',
          transition: 'height 0.4s ease',
        }}
      />
      {/* Current Level Dot Indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: `calc(${bottomPos} - 6px)`,
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: dotColor,
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
          transition: 'bottom 0.4s ease',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main TripWeatherTab Component                                              */
/* -------------------------------------------------------------------------- */

export function TripWeatherTab({
  destinationCity,
  tripStartDate,
  tripEndDate,
  selectedDay = 'all',
  onSelectDay,
  coordinates,
  tripDaysCount,
}: TripWeatherTabProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<WeatherForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOutOfRange, setIsOutOfRange] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<{
    temp_c: number;
    condition: string;
    icon_type: string;
    humidity: number;
    wind_kmh: number;
  } | null>(null);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [selectedDayOverride, setSelectedDayOverride] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isDraggingStrip, setIsDraggingStrip] = useState(false);

  const forecastStripRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollVelocityRef = useRef<number>(0);
  const dragScrollStateRef = useRef<{
    isPointerDown: boolean;
    startX: number;
    startScrollLeft: number;
    hasDragged: boolean;
  }>({
    isPointerDown: false,
    startX: 0,
    startScrollLeft: 0,
    hasDragged: false,
  });
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    const syncUnit = () => {
      if (typeof window === 'undefined') return;
      setUnit(localStorage.getItem('paladio_unit_temperature') === 'F' ? 'F' : 'C');
    };
    syncUnit();
    window.addEventListener('paladio_units_changed', syncUnit);
    window.addEventListener('storage', syncUnit);
    return () => {
      window.removeEventListener('paladio_units_changed', syncUnit);
      window.removeEventListener('storage', syncUnit);
    };
  }, []);

  const { effectiveStartDate, effectiveEndDate } = useMemo(() => {
    const start = tripStartDate ? tripStartDate.split('T')[0].trim() : '';
    let end = tripEndDate ? tripEndDate.split('T')[0].trim() : '';

    if (start && !end && tripDaysCount && tripDaysCount > 0) {
      const sDate = new Date(start);
      if (!isNaN(sDate.getTime())) {
        sDate.setUTCDate(sDate.getUTCDate() + tripDaysCount - 1);
        end = sDate.toISOString().slice(0, 10);
      }
    }
    return { effectiveStartDate: start, effectiveEndDate: end };
  }, [tripStartDate, tripEndDate, tripDaysCount]);

  const daysUntilTrip = useMemo(() => {
    if (!effectiveStartDate) return null;
    const start = new Date(effectiveStartDate + 'T00:00:00');
    if (isNaN(start.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = start.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [effectiveStartDate]);

  const activeDayIndex = useMemo(() => {
    if (selectedDayOverride !== null) return selectedDayOverride;
    if (typeof selectedDay === 'number' && data?.forecast_days && selectedDay >= 1) {
      return Math.min(selectedDay - 1, data.forecast_days.length - 1);
    }
    return 0;
  }, [selectedDayOverride, selectedDay, data]);

  const fetchWeather = useCallback(async () => {
    setError(null);
    setIsOutOfRange(false);

    const queryParams = new URLSearchParams();
    if (destinationCity) queryParams.set('city', destinationCity);
    if (coordinates?.lat && coordinates?.lng) {
      queryParams.set('lat', String(coordinates.lat));
      queryParams.set('lon', String(coordinates.lng));
    }
    if (effectiveStartDate && effectiveEndDate) {
      queryParams.set('start_date', effectiveStartDate);
      queryParams.set('end_date', effectiveEndDate);
    }

    try {
      const res = await apiFetch<WeatherForecastResponse>(`/weather/forecast?${queryParams.toString()}`);
      if (!res.forecast_days || res.forecast_days.length === 0) {
        throw new Error(translate('weather.no_forecast_days'));
      }
      setData(res);
      setIsLoading(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : translate('weather.telemetry_request_failed');
      console.warn('Backend weather route failed, attempting direct Open-Meteo fallback:', errMsg);
      const isDateOutOfRange =
        errMsg.toLowerCase().includes('out of') ||
        errMsg.toLowerCase().includes('range') ||
        errMsg.toLowerCase().includes('16 days') ||
        errMsg.toLowerCase().includes('14') ||
        (daysUntilTrip !== null && daysUntilTrip > 16);
      if (isDateOutOfRange) {
        setIsOutOfRange(true);
      }

      try {
        let lat = coordinates?.lat;
        let lon = coordinates?.lng;

        if ((lat == null || lon == null) && destinationCity) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destinationCity)}&count=1&language=en&format=json`
          );
          if (geoRes.ok) {
            const geoJson = await geoRes.json();
            if (geoJson.results?.[0]) {
              lat = geoJson.results[0].latitude;
              lon = geoJson.results[0].longitude;
            }
          }
        }

        if (lat == null || lon == null) {
          throw new Error(
            destinationCity
              ? translate('weather.resolve_coords_failed', { city: destinationCity })
              : translate('weather.coords_unavailable')
          );
        }

        const dateRangeParams =
          effectiveStartDate && effectiveEndDate
            ? `&start_date=${effectiveStartDate}&end_date=${effectiveEndDate}`
            : `&forecast_days=7`;

        const fRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,wind_speed_10m_max,wind_direction_10m_dominant&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,visibility&hourly=relative_humidity_2m,visibility,uv_index&timezone=auto${dateRangeParams}`
        );
        const fJson = await fRes.json().catch(() => ({}));

        if (!fRes.ok || fJson.error) {
          const reason = fJson.reason || fJson.error || translate('weather.api_status_error', { status: fRes.status });
          if (
            String(reason).toLowerCase().includes('out of allowed range') ||
            String(reason).toLowerCase().includes('out of range')
          ) {
            setIsOutOfRange(true);
          }
          throw new Error(String(reason));
        }

        const dayNames = [
          translate('weather.weekday_mon'),
          translate('weather.weekday_tue'),
          translate('weather.weekday_wed'),
          translate('weather.weekday_thu'),
          translate('weather.weekday_fri'),
          translate('weather.weekday_sat'),
          translate('weather.weekday_sun'),
        ];
        const times = fJson.daily?.time || [];
        if (times.length === 0) {
          throw new Error(translate('weather.empty_daily_forecast'));
        }

        const formatSunTime = (isoStr: string | undefined, fallbackLabel: string): string => {
          if (!isoStr || !isoStr.includes('T')) return fallbackLabel;
          const timePart = isoStr.split('T')[1];
          const [hStr, mStr] = (timePart || '').split(':');
          const hour = Number(hStr);
          if (Number.isNaN(hour) || !mStr) return fallbackLabel;
          const amPm = hour < 12 ? translate('weather.am') : translate('weather.pm');
          const h12 = hour % 12 || 12;
          return `${h12}:${mStr.slice(0, 2)} ${amPm}`;
        };

        const days: WeatherDayForecast[] = times.map((timeStr: string, i: number) => {
          const code = fJson.daily?.weather_code?.[i] || 0;
          const dObj = new Date(timeStr);
          const dName = dayNames[dObj.getDay() === 0 ? 6 : dObj.getDay() - 1] || translate('weather.day_fallback');
          return {
            date: timeStr,
            day_name: dName,
            weather_code: code,
            condition:
              code === 0
                ? translate('weather.cond_clear_sky')
                : code < 3
                ? translate('weather.cond_partly_cloudy')
                : translate('weather.cond_cloudy'),
            icon_type: code === 0 ? 'clear' : code < 3 ? 'partly-cloudy' : code > 50 ? 'rain' : 'cloudy',
            temp_max_c: Math.round(fJson.daily?.temperature_2m_max?.[i] || 20),
            temp_min_c: Math.round(fJson.daily?.temperature_2m_min?.[i] || 12),
            highlights: {
              uv_index: fJson.daily?.uv_index_max?.[i] || 5,
              uv_status: translate('weather.status_moderate'),
              wind_speed_kmh: Math.round(fJson.daily?.wind_speed_10m_max?.[i] || 8),
              wind_direction_deg: fJson.daily?.wind_direction_10m_dominant?.[i] || 240,
              wind_direction_cardinal: 'WSW',
              sunrise: formatSunTime(fJson.daily?.sunrise?.[i], `06:30 ${translate('weather.am')}`),
              sunset: formatSunTime(fJson.daily?.sunset?.[i], `06:30 ${translate('weather.pm')}`),
              humidity_pct: Math.round(fJson.current?.relative_humidity_2m ?? 58),
              humidity_status: translate('weather.status_normal'),
              visibility_km: Number(((fJson.current?.visibility ?? 10000) / 1000).toFixed(1)),
              visibility_status: translate('weather.status_clear'),
              aqi: 42,
              aqi_status: translate('weather.status_good'),
            },
          };
        });

        setData({
          city: destinationCity || translate('weather.trip_destination_fallback'),
          latitude: lat,
          longitude: lon,
          timezone: fJson.timezone || 'UTC',
          current_temp_c: Math.round(fJson.current?.temperature_2m || 18),
          current_condition: translate('weather.live_telemetry'),
          current_weather_code: fJson.current?.weather_code || 0,
          current_icon_type: 'partly-cloudy',
          forecast_days: days,
          travel_advisory: translate('weather.optimal_conditions_advisory'),
        });
        setIsLoading(false);
      } catch (fallbackErr: unknown) {
        const finalMsg = fallbackErr instanceof Error ? fallbackErr.message : errMsg;
        setError(finalMsg);
        setIsLoading(false);

        // Fetch optional live conditions preview for today if destination coords available
        const previewLat = coordinates?.lat;
        const previewLon = coordinates?.lng;
        if (previewLat != null && previewLon != null) {
          try {
            const curRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${previewLat}&longitude=${previewLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&forecast_days=1`
            );
            if (curRes.ok) {
              const curJson = await curRes.json();
              if (curJson.current) {
                const code = curJson.current.weather_code || 0;
                setCurrentPreview({
                  temp_c: Math.round(curJson.current.temperature_2m),
                  condition:
                    code === 0
                      ? translate('weather.cond_clear_sky')
                      : code < 3
                      ? translate('weather.cond_partly_cloudy')
                      : code > 50
                      ? translate('weather.cond_rain')
                      : translate('weather.cond_cloudy'),
                  icon_type: code === 0 ? 'clear' : code < 3 ? 'partly-cloudy' : code > 50 ? 'rain' : 'cloudy',
                  humidity: curJson.current.relative_humidity_2m ?? 50,
                  wind_kmh: Math.round(curJson.current.wind_speed_10m ?? 10),
                });
              }
            }
          } catch {
            // Optional preview - non-blocking
          }
        }
      }
    }
  }, [destinationCity, coordinates, effectiveStartDate, effectiveEndDate, daysUntilTrip]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchWeather();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWeather, reloadToken]);

  const handleManualRefresh = () => {
    setIsLoading(true);
    setReloadToken((prev) => prev + 1);
  };

  const stopStripHoverScroll = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollVelocityRef.current = 0;
  }, []);

  const startStripHoverScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    const loop = () => {
      const el = forecastStripRef.current;
      if (!el || scrollVelocityRef.current === 0) {
        scrollRafRef.current = null;
        return;
      }
      el.scrollLeft += scrollVelocityRef.current;
      scrollRafRef.current = requestAnimationFrame(loop);
    };
    scrollRafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    return () => {
      stopStripHoverScroll();
    };
  }, [stopStripHoverScroll]);

  useEffect(() => {
    const el = forecastStripRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
        const atEnd = el.scrollLeft >= maxScroll - 1 && e.deltaY > 0;
        if (!atStart && !atEnd) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [data, isLoading]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (!dragScrollStateRef.current.isPointerDown) return;
      const didDrag = dragScrollStateRef.current.hasDragged;
      dragScrollStateRef.current.isPointerDown = false;
      dragScrollStateRef.current.hasDragged = false;
      setIsDraggingStrip(false);
      if (didDrag) {
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleStripMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = forecastStripRef.current;
    if (!el) return;
    stopStripHoverScroll();
    dragScrollStateRef.current = {
      isPointerDown: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      hasDragged: false,
    };
  };

  const handleStripMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = forecastStripRef.current;
    if (!el) return;

    if (dragScrollStateRef.current.isPointerDown) {
      stopStripHoverScroll();
      const deltaX = e.clientX - dragScrollStateRef.current.startX;
      if (Math.abs(deltaX) > 5) {
        if (!dragScrollStateRef.current.hasDragged) {
          dragScrollStateRef.current.hasDragged = true;
          suppressNextClickRef.current = true;
          setIsDraggingStrip(true);
        }
        el.scrollLeft = dragScrollStateRef.current.startScrollLeft - deltaX;
      }
      return;
    }

    if (el.scrollWidth <= el.clientWidth) {
      stopStripHoverScroll();
      return;
    }

    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const edgeThreshold = 48;
    const maxSpeed = 9;

    if (mouseX < edgeThreshold && el.scrollLeft > 0) {
      const intensity = (edgeThreshold - mouseX) / edgeThreshold;
      scrollVelocityRef.current = -Math.max(1, intensity * maxSpeed);
      startStripHoverScroll();
    } else if (mouseX > rect.width - edgeThreshold && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
      const intensity = (mouseX - (rect.width - edgeThreshold)) / edgeThreshold;
      scrollVelocityRef.current = Math.max(1, intensity * maxSpeed);
      startStripHoverScroll();
    } else {
      stopStripHoverScroll();
    }
  };

  const handleStripMouseLeave = () => {
    stopStripHoverScroll();
  };

  const convertTemp = useCallback(
    (tempC: number) => {
      if (unit === 'F') {
        return Math.round((tempC * 9) / 5 + 32);
      }
      return Math.round(tempC);
    },
    [unit]
  );

  const selectedDayForecast = useMemo(() => {
    if (!data?.forecast_days || data.forecast_days.length === 0) return null;
    return data.forecast_days[activeDayIndex] || data.forecast_days[0];
  }, [data, activeDayIndex]);

  const handleCardClick = (idx: number) => {
    if (suppressNextClickRef.current) return;
    setSelectedDayOverride(idx);
    if (onSelectDay) {
      onSelectDay(idx + 1);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Loading State                                                              */
  /* -------------------------------------------------------------------------- */
  if (isLoading && !data) {
    return (
      <div
        data-testid="weather-tab-loading"
        style={{
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        <Spinner size={24} color="var(--color-accent-primary)" />
        <div style={{ fontSize: '13px', fontWeight: 500 }}>
          {destinationCity
            ? t('weather.gathering_telemetry_city', { city: destinationCity })
            : t('weather.gathering_telemetry_generic')}
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Warning / Telemetry Unavailable State (Never blank)                        */
  /* -------------------------------------------------------------------------- */
  const hasValidForecast = Boolean(
    data && data.forecast_days && data.forecast_days.length > 0 && selectedDayForecast
  );

  if (!hasValidForecast) {
    const cityDisplayName = destinationCity || data?.city || t('weather.trip_destination_fallback');
    const outOfRangeDetected =
      isOutOfRange ||
      (daysUntilTrip !== null && daysUntilTrip > 16) ||
      Boolean(error?.toLowerCase().includes('out of') && error?.toLowerCase().includes('range')) ||
      Boolean(error?.toLowerCase().includes('14') || error?.toLowerCase().includes('16'));

    const displayLat = coordinates?.lat ?? data?.latitude;
    const displayLon = coordinates?.lng ?? data?.longitude;

    return (
      <div
        data-testid="weather-tab-warning"
        style={{
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          color: 'var(--color-text-primary)',
        }}
      >
        {/* Header bar: City, Coordinates/Dates, Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em' }}>
                {cityDisplayName}
              </span>
              {displayLat != null && displayLon != null && (
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(15, 76, 92, 0.08)',
                    color: 'var(--color-accent-primary)',
                    fontWeight: 600,
                  }}
                >
                  {`${Math.abs(displayLat).toFixed(2)}°${displayLat >= 0 ? t('weather.dir_n') : t('weather.dir_s')}, ${Math.abs(displayLon).toFixed(2)}°${displayLon >= 0 ? t('weather.dir_e') : t('weather.dir_w')}`}
                </span>
              )}
            </div>
            {effectiveStartDate && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  marginTop: '2px',
                  fontFamily: 'monospace',
                }}
              >
                {effectiveStartDate}
                {effectiveEndDate ? ` – ${effectiveEndDate}` : ''}
                {daysUntilTrip !== null && daysUntilTrip > 0
                  ? ` (${t('weather.days_away', { count: daysUntilTrip })})`
                  : ''}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-secondary)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title={t('weather.refresh_telemetry_title')}
          >
            <RefreshIcon size={12} />
            <span>{t('common.retry')}</span>
          </button>
        </div>

        {/* Warning Card */}
        <div
          data-testid="weather-warning-card"
          style={{
            borderRadius: '12px',
            border: '1px solid rgba(226, 179, 60, 0.4)',
            borderLeft: '4px solid var(--color-accent-warning, #E2B33C)',
            background: 'rgba(226, 179, 60, 0.08)',
            padding: '22px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '12px',
          }}
        >
          <WeatherForecastIllustration width={120} height={76} />

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              background: 'var(--color-accent-warning-subtle, #FBF1D6)',
              color: '#7A5A00',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
            }}
          >
            <AlertTriangleIcon size={12} color="#7A5A00" />
            <span>{outOfRangeDetected ? t('weather.forecast_window_notice') : t('weather.telemetry_warning')}</span>
          </div>

          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {outOfRangeDetected
              ? t('weather.forecast_not_yet_available')
              : t('weather.telemetry_unavailable')}
          </div>

          <p
            style={{
              fontSize: '12px',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              margin: 0,
              maxWidth: '380px',
            }}
          >
            {outOfRangeDetected ? (
              t('weather.out_of_range_body', {
                limit: '__WEATHER_LIMIT__',
                city: '__WEATHER_CITY__',
                date: effectiveStartDate
                  ? daysUntilTrip !== null && daysUntilTrip > 0
                    ? `${effectiveStartDate} (${t('weather.days_away', { count: daysUntilTrip })})`
                    : effectiveStartDate
                  : t('weather.future_date'),
              })
                .split(/(__WEATHER_LIMIT__|__WEATHER_CITY__)/g)
                .map((part, idx) =>
                  part === '__WEATHER_LIMIT__' ? (
                    <strong key={idx}>{t('weather.out_of_range_limit')}</strong>
                  ) : part === '__WEATHER_CITY__' ? (
                    <strong key={idx}>{cityDisplayName}</strong>
                  ) : (
                    part
                  )
                )
            ) : (
              t('weather.telemetry_error_body', {
                city: '__WEATHER_CITY__',
                errorDetail: error ? `: ${error}.` : '.',
              })
                .split('__WEATHER_CITY__')
                .map((part, idx, arr) => (
                  <React.Fragment key={idx}>
                    {part}
                    {idx < arr.length - 1 ? <strong>{cityDisplayName}</strong> : null}
                  </React.Fragment>
                ))
            )}
          </p>

          {/* Guidance Callout */}
          <div
            style={{
              width: '100%',
              background: 'var(--color-surface-card)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              textAlign: 'left',
            }}
          >
            <InfoIcon
              size={14}
              color="var(--color-accent-primary)"
              style={{ marginTop: '2px', flexShrink: 0 }}
            />
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{t('weather.automatic_updates_label')}</strong>
              {t('weather.automatic_updates_desc')}
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-subtle)',
            }}
          >
            <RefreshIcon size={13} />
            <span>{t('weather.retry_telemetry')}</span>
          </button>
        </div>

        {/* Current Live Weather Preview (if available) */}
        {currentPreview && (
          <div
            data-testid="weather-current-preview"
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {t('weather.live_reference_in_city', { city: cityDisplayName })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <WeatherIcon type={currentPreview.icon_type} size={30} />
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>
                    {unit === 'F'
                      ? Math.round((currentPreview.temp_c * 9) / 5 + 32)
                      : currentPreview.temp_c}
                    °{unit}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {currentPreview.condition}
                  </div>
                </div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.4,
                }}
              >
                <div>{t('weather.humidity_value', { value: currentPreview.humidity })}</div>
                <div>{t('weather.wind_value', { value: currentPreview.wind_kmh })}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!data || !selectedDayForecast) return null;

  const h = selectedDayForecast.highlights;

  // AQI color styling
  const aqiColor =
    h.aqi <= 50 ? '#1F7A4D' : h.aqi <= 100 ? '#E2B33C' : h.aqi <= 150 ? '#F59E0B' : '#D42A2F';

  return (
    <div
      data-testid="weather-tab-content"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: 'var(--color-text-primary)',
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* -------------------------------------------------------------------- */}
      {/* Header bar: City, Coordinates                                        */}
      {/* -------------------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em' }}>
              {data.city}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(15, 76, 92, 0.08)',
                color: 'var(--color-accent-primary)',
                fontWeight: 600,
              }}
            >
              {`${data.latitude.toFixed(2)}°${t('weather.dir_n')}, ${data.longitude.toFixed(2)}°${t('weather.dir_e')}`}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {effectiveStartDate
              ? effectiveEndDate && effectiveEndDate !== effectiveStartDate
                ? `${effectiveStartDate} – ${effectiveEndDate} • `
                : `${effectiveStartDate} • `
              : ''}
            {data.timezone} • {data.current_condition} ({convertTemp(data.current_temp_c)}°{unit})
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 1. Day Forecast Strip (Matching Image 2 Top Section)                 */}
      {/* -------------------------------------------------------------------- */}
      <div style={{ minWidth: 0, width: '100%' }}>
        <div
          ref={forecastStripRef}
          data-testid="weather-forecast-strip"
          className="no-scrollbar"
          onMouseDown={handleStripMouseDown}
          onMouseMove={handleStripMouseMove}
          onMouseLeave={handleStripMouseLeave}
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            overflowY: 'hidden',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            minWidth: 0,
            width: '100%',
            userSelect: 'none',
            WebkitOverflowScrolling: 'touch',
            cursor: isDraggingStrip ? 'grabbing' : 'default',
          }}
        >
          {data.forecast_days.map((day, idx) => {
            const isSelected = idx === activeDayIndex;
            return (
              <button
                key={day.date}
                type="button"
                data-testid={`weather-day-card-${idx}`}
                onClick={() => handleCardClick(idx)}
                style={{
                  flex: '0 0 auto',
                  minWidth: '60px',
                  padding: '10px 8px',
                  borderRadius: '14px',
                  border: isSelected
                    ? '1.5px solid var(--color-accent-primary)'
                    : '1px solid var(--color-border)',
                  background: isSelected
                    ? 'var(--color-surface-raised, #FFFFFF)'
                    : 'var(--color-surface-card, #FAF6F0)',
                  boxShadow: isSelected
                    ? '0 3px 12px rgba(15, 76, 92, 0.12)'
                    : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  textAlign: 'center',
                }}
              >
                {/* Day of Week */}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                  }}
                >
                  {day.day_name}
                </span>

                {/* Weather Condition Icon */}
                <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                  <WeatherIcon type={day.icon_type} size={28} />
                </div>

                {/* Temp Range: Max° Min° */}
                <div style={{ fontSize: '11px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {convertTemp(day.temp_max_c)}°
                  </span>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', fontSize: '10px' }}>
                    {convertTemp(day.temp_min_c)}°
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. Highlights Section Title                                          */}
      {/* -------------------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em' }}>
          {selectedDayForecast.date === new Date().toISOString().slice(0, 10)
            ? t('weather.todays_highlights')
            : t('weather.day_highlights', { day: selectedDayForecast.day_name })}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          {selectedDayForecast.date} • {selectedDayForecast.condition}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. Six Tactical Highlight Cards Grid (Inspired by Image 2)           */}
      {/* -------------------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Card 1: UV Index */}
        <div
          data-testid="weather-card-uv"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.uv_index')}
          </div>
          <div style={{ margin: '4px 0' }}>
            <UvGauge value={h.uv_index} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              color: h.uv_index >= 8 ? 'var(--color-accent-coral)' : h.uv_index >= 6 ? '#F59E0B' : 'var(--color-text-primary)',
            }}
          >
            {h.uv_index >= 6 ? (
              <AlertTriangleIcon size={12} color="currentColor" />
            ) : (
              <CheckIcon size={12} color="#1F7A4D" />
            )}
            <span>{h.uv_status}</span>
          </div>
        </div>

        {/* Card 2: Wind Status */}
        <div
          data-testid="weather-card-wind"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.wind_status')}
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
              {h.wind_speed_kmh}{' '}
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                km/h
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'rgba(15, 76, 92, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(${h.wind_direction_deg}deg)`,
                transition: 'transform 0.4s ease',
              }}
            >
              {/* Blue/Teal compass pin */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <polygon points="12 2 19 21 12 17 5 21 12 2" fill="var(--color-accent-primary)" />
              </svg>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {h.wind_direction_cardinal}
            </span>
          </div>
        </div>

        {/* Card 3: Sunrise & Sunset */}
        <div
          data-testid="weather-card-sun"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.sunrise_sunset')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Sunrise */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(226, 179, 60, 0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent-gold, #E2B33C)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {h.sunrise}
                </div>
              </div>
            </div>

            {/* Sunset */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(212, 42, 47, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent-coral, #D42A2F)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {h.sunset}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Humidity */}
        <div
          data-testid="weather-card-humidity"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.humidity')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                {h.humidity_pct}
                <span style={{ fontSize: '16px' }}>%</span>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  marginTop: '8px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
                <span>{h.humidity_status}</span>
              </div>
            </div>
            <VerticalSliderGauge percentage={h.humidity_pct} dotColor="#3B82F6" />
          </div>
        </div>

        {/* Card 5: Visibility */}
        <div
          data-testid="weather-card-visibility"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.visibility')}
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
              {h.visibility_km}{' '}
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                km
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{h.visibility_status}</span>
          </div>
        </div>

        {/* Card 6: Air Quality */}
        <div
          data-testid="weather-card-aqi"
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '135px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {t('weather.air_quality')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                {h.aqi}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: aqiColor,
                  marginTop: '8px',
                }}
              >
                {h.aqi <= 50 ? (
                  <CheckIcon size={12} color={aqiColor} />
                ) : h.aqi <= 100 ? (
                  <InfoIcon size={12} color={aqiColor} />
                ) : (
                  <AlertTriangleIcon size={12} color={aqiColor} />
                )}
                <span>{h.aqi_status}</span>
              </div>
            </div>
            <VerticalSliderGauge
              percentage={Math.min(100, Math.round((h.aqi / 200) * 100))}
              dotColor={aqiColor}
            />
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. Tactical Travel Advisory Banner                                    */}
      {/* -------------------------------------------------------------------- */}
      {data.travel_advisory && (
        <div
          data-testid="weather-travel-advisory"
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            background: 'rgba(15, 76, 92, 0.06)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--color-text-primary)',
          }}
        >
          <CompassIcon size={15} color="var(--color-accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <span style={{ fontWeight: 700, color: 'var(--color-accent-primary)' }}>
              {t('weather.travel_advisory_label')}
            </span>{' '}
            {data.travel_advisory}
          </div>
        </div>
      )}
    </div>
  );
}
