import React from 'react';

import { OptimizationResult, DayOutput, ScheduledPoi } from '../types/domain';
import { apiFetch } from '../utils/api';
import { notify } from '../utils/notify';
import { PoiCategoryBadge } from './PoiCategoryBadge';
import { TransitLegView, TransitRecommendationCard } from './TransitLegView';

interface TripTimelineProps {
  itinerary: OptimizationResult | null;
  tripId?: string;
  onItineraryUpdate?: (updated: OptimizationResult) => void;
}

export function TripTimeline({ itinerary, tripId, onItineraryUpdate }: TripTimelineProps) {
  const [upgradedItinerary, setUpgradedItinerary] = React.useState<OptimizationResult | null>(null);
  const [upgrading, setUpgrading] = React.useState(false);
  const [upgraded, setUpgraded] = React.useState(false);
  const [gtfsStatus, setGtfsStatus] = React.useState<string | null>(null);
  const [isTooltipOpen, setIsTooltipOpen] = React.useState(false);

  const currentItinerary = upgradedItinerary || itinerary;

  // Support both standard multi-day { days: [...] } and flat single-day fallback { path: [...] }
  const days: DayOutput[] = React.useMemo(() => {
    if (!currentItinerary) return [];
    if (currentItinerary.days && currentItinerary.days.length > 0) {
      return currentItinerary.days;
    }
    const fallbackPath = (currentItinerary as unknown as { path?: ScheduledPoi[] }).path;
    if (fallbackPath) {
      return [{ day: 1, itinerary: { path: fallbackPath } }];
    }
    return [];
  }, [currentItinerary]);

  // Extract destination city from itinerary constraints or first POI
  const destinationCity = React.useMemo(() => {
    if (currentItinerary?.travel_constraints?.destination_city) {
      return currentItinerary.travel_constraints.destination_city;
    }
    for (const d of days) {
      const p = d.itinerary?.path?.find((item) => item.poi?.city);
      if (p && p.poi?.city) return p.poi.city;
    }
    return '';
  }, [currentItinerary, days]);

  // Query GTFS transit status and poll until READY
  React.useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        let endpoint = '';
        if (tripId) {
          endpoint = `/trips/${tripId}/transit-status`;
        } else if (destinationCity) {
          endpoint = `/trips/transit-status?city=${encodeURIComponent(destinationCity)}`;
        } else {
          return;
        }

        const data = await apiFetch<{
          city: string;
          gtfs_status: string;
          is_ready: boolean;
        }>(endpoint);

        if (isMounted && data) {
          setGtfsStatus(data.gtfs_status);
          if (data.is_ready && intervalId) {
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        // Silently capture status fetch error
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 5000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [tripId, destinationCity]);

  const isGtfsReady = gtfsStatus === 'READY';

  // Check if any leg currently has estimated transit
  const hasEstimatedTransit = React.useMemo(() => {
    return days.some((d) =>
      d.itinerary?.path?.some(
        (p) =>
          p.transit_from_previous &&
          (p.transit_from_previous.cost_is_estimated ||
            p.transit_from_previous.price_source === 'fallback_estimate' ||
            p.transit_from_previous.price_source === 'regional_benchmark_estimate' ||
            p.transit_from_previous.steps?.some((s) => s.transit_line === 'Transit'))
      )
    );
  }, [days]);

  // Check if already upgraded to hide the button permanently across refreshes/page changes
  const isAlreadyUpgraded = React.useMemo(() => {
    if (upgraded || currentItinerary?.is_upgraded || currentItinerary?.metadata?.transit_upgraded) {
      return true;
    }
    if (typeof window !== 'undefined') {
      if (tripId && sessionStorage.getItem(`paladio_trip_upgraded_${tripId}`) === 'true') {
        return true;
      }
      if (destinationCity && sessionStorage.getItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`) === 'true') {
        return true;
      }
      try {
        const cached = sessionStorage.getItem('paladio_itinerary');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.is_upgraded || parsed?.metadata?.transit_upgraded) return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  }, [upgraded, currentItinerary, tripId, destinationCity]);

  const showUpgradeToolbar = !isAlreadyUpgraded && (hasEstimatedTransit || isGtfsReady);

  // Check if any day or leg contains public transit
  const hasTransit = React.useMemo(() => {
    return days.some((d) =>
      Boolean(d.itinerary?.transit_recommendation) ||
      d.itinerary?.path?.some((p) => {
        const t = p.transit_from_previous;
        return Boolean(t && (t.mode === 'transit' || (t.steps && t.steps.length > 0) || (t.cost_eur && t.cost_eur > 0)));
      })
    );
  }, [days]);

  const handleUpgrade = async () => {
    if (upgrading || !isGtfsReady) return;
    setUpgrading(true);

    try {
      if (tripId) {
        const data = await apiFetch<{
          status: string;
          trip_id: string;
          itinerary_data: OptimizationResult;
        }>(`/trips/${tripId}/upgrade-transit`, {
          method: 'POST',
        });
        if (data && data.itinerary_data) {
          setUpgradedItinerary(data.itinerary_data);
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem('paladio_itinerary', JSON.stringify(data.itinerary_data));
              sessionStorage.setItem(`paladio_trip_upgraded_${tripId}`, 'true');
              if (destinationCity) {
                sessionStorage.setItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`, 'true');
              }
            } catch {
              // ignore
            }
          }
          if (onItineraryUpdate) {
            onItineraryUpdate(data.itinerary_data);
          }
        }
      } else if (currentItinerary) {
        const updated: OptimizationResult = {
          ...currentItinerary,
          is_upgraded: true,
          metadata: {
            ...(currentItinerary.metadata || {
              engine: 'paladio_core_cpp20',
              version: '2.0.0',
              nodes_evaluated: 0,
            }),
            transit_upgraded: true,
          } as OptimizationResult['metadata'],
        };
        setUpgradedItinerary(updated);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('paladio_itinerary', JSON.stringify(updated));
            if (destinationCity) {
              sessionStorage.setItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`, 'true');
            }
          } catch {
            // ignore
          }
        }
        if (onItineraryUpdate) {
          onItineraryUpdate(updated);
        }
      }
      if (typeof window !== 'undefined') {
        try {
          if (tripId) sessionStorage.setItem(`paladio_trip_upgraded_${tripId}`, 'true');
          if (destinationCity) sessionStorage.setItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`, 'true');
        } catch {
          // ignore
        }
      }
      notify.success(
        'Transit Upgraded',
        'Itinerary updated with exact public transit lines, stations, and cascading schedule.'
      );
      setUpgraded(true);
    } catch (err) {
      console.error('Failed to upgrade transit:', err);
      notify.error('Upgrade Failed', 'Could not upgrade transit directions at this time.');
    } finally {
      setUpgrading(false);
    }
  };

  if (!currentItinerary || days.length === 0) {
    return <div style={{ padding: '1rem', color: 'var(--color-muted)' }}>No route data available.</div>;
  }

  return (
    <div style={{ padding: '1rem' }}>
      {/* Discrete Toolbar Upgrade Action */}
      {showUpgradeToolbar && (
        <div
          data-testid="transit-upgrade-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* Information Icon with hover tooltip */}
          <div
            className="relative inline-flex items-center"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setIsTooltipOpen(true)}
            onMouseLeave={() => setIsTooltipOpen(false)}
            onFocus={() => setIsTooltipOpen(true)}
            onBlur={() => setIsTooltipOpen(false)}
          >
            <div
              aria-label="Transit upgrade info"
              role="button"
              tabIndex={0}
              data-testid="transit-info-icon"
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                background: isGtfsReady ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                color: isGtfsReady ? '#60a5fa' : '#9ca3af',
                border: isGtfsReady ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(255, 255, 255, 0.15)',
                transition: 'all 0.2s ease',
              }}
            >
              ℹ
            </div>

            {/* Tooltip */}
            {isTooltipOpen && (
              <div
                role="tooltip"
                data-testid="transit-info-tooltip"
                className="font-mono"
                style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '280px',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: '#18181b',
                  border: isGtfsReady ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid #3f3f46',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
                  color: '#e4e4e7',
                  fontSize: '0.75rem',
                  lineHeight: '1.4',
                  zIndex: 50,
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                    color: isGtfsReady ? '#60a5fa' : '#fbbf24',
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    letterSpacing: '0.5px',
                  }}
                >
                  <span>{isGtfsReady ? '● READY' : '○ GTFS SCHEDULE COMPILING'}</span>
                </div>
                <div style={{ color: '#d1d5db' }}>
                  {isGtfsReady
                    ? 'Upgrades estimated transit times and fallback routes to exact real-world public transit lines, metro/bus stops, and live cascading schedules for this city.'
                    : gtfsStatus === 'UNAVAILABLE'
                    ? 'Real-world transit schedule data (GTFS) is unavailable for this city. The button remains disabled.'
                    : 'Public transit schedule data (GTFS) for this city is currently being downloaded and compiled. The button will activate automatically once schedules are ready.'}
                </div>
              </div>
            )}
          </div>

          {/* Upgrade Button */}
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={!isGtfsReady || upgrading}
            data-testid="upgrade-transit-btn"
            className="font-mono text-xs"
            style={{
              background: upgrading
                ? '#2b2b2b'
                : isGtfsReady
                ? 'rgba(59, 130, 246, 0.12)'
                : '#27272a',
              color: upgrading
                ? '#777777'
                : isGtfsReady
                ? '#60a5fa'
                : '#71717a',
              border: upgrading
                ? '1px solid #444444'
                : isGtfsReady
                ? '1px solid rgba(59, 130, 246, 0.35)'
                : '1px solid #3f3f46',
              borderRadius: '4px',
              padding: '0.4rem 0.8rem',
              cursor: !isGtfsReady || upgrading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              opacity: upgrading ? 0.6 : isGtfsReady ? 1 : 0.7,
            }}
          >
            {upgrading ? (
              <>
                <span>⏳</span>
                <span>UPGRADING TO REAL PUBLIC TRANSIT...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>UPGRADE TO REAL PUBLIC TRANSIT</span>
              </>
            )}
          </button>
        </div>
      )}
      {days.map((dayObj: DayOutput, dayIdx: number) => {
        const path = dayObj.itinerary?.path || [];
        const transitRec = dayObj.itinerary?.transit_recommendation;

        return (
          <div key={dayIdx} style={{ marginBottom: '2.5rem' }}>
            {/* Day Header */}
            <div style={{ margin: '1.5rem 0 0.75rem 0' }}>
              <h4
                className="font-display text-accent"
                style={{ fontSize: '1.2rem', letterSpacing: '1px' }}
              >
                DAY {dayObj.day}
              </h4>
            </div>

            {/* Daily Transit Pass Advisory Banner */}
            {transitRec && path.length > 1 && (transitRec.single_tickets_total_eur || 0) > 0 && (
              <TransitRecommendationCard recommendation={transitRec} />
            )}

            {/* Empty day message */}
            {path.length === 0 && !dayObj.flight_info && (
              <div
                className="font-mono text-muted text-sm"
                style={{
                  padding: '1rem',
                  border: '1px dashed var(--color-border)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.02)',
                  textAlign: 'center',
                  marginBottom: '1rem',
                }}
              >
                No scheduled stops for this day. Free exploration.
              </div>
            )}

            {/* Inbound / Arrival Flight (Trip Start / Day Arrival) */}
            {(() => {
              const arrivalFlight =
                (dayObj as any).inbound_flight ||
                (dayObj.flight_info?.direction === 'arrival'
                  ? dayObj.flight_info
                  : dayIdx === 0 && dayObj.flight_info?.direction !== 'departure'
                  ? dayObj.flight_info
                  : null);

              if (!arrivalFlight) return null;

              const origin = arrivalFlight.origin_iata || 'DEP';
              const dest = arrivalFlight.destination_iata || 'ARR';
              const depTime = arrivalFlight.departure_time || '--:--';
              let arrTime = arrivalFlight.arrival_time;
              if (!arrTime && arrivalFlight.departure_time && arrivalFlight.flight_duration_minutes) {
                try {
                  const d = new Date(arrivalFlight.departure_time);
                  if (!isNaN(d.getTime())) {
                    arrTime = new Date(d.getTime() + arrivalFlight.flight_duration_minutes * 60000).toISOString();
                  }
                } catch {}
              }

              const formatT = (t?: string) => {
                if (!t || t === '--:--') return '--:--';
                if (t.includes('T')) return t.split('T')[1].substring(0, 5);
                if (t.includes(' ')) return t.split(' ')[1].substring(0, 5);
                return t.substring(0, 5);
              };

              return (
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', marginBottom: '1rem' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '7px',
                      top: '24px',
                      bottom: '-20px',
                      width: '2px',
                      background: 'var(--color-border)',
                    }}
                  />
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: 'var(--color-accent-primary)',
                      marginTop: '4px',
                      zIndex: 1,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="font-mono" style={{ fontWeight: 600 }}>
                          Flight to {dest} (Arrival)
                        </span>
                        <PoiCategoryBadge category="flight" name="Flight" size="xs" />
                      </div>
                      <span className="font-mono text-muted text-sm">
                        {formatT(arrTime || depTime)}
                      </span>
                    </div>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {origin} → {dest} • Dep: {formatT(depTime)} | Arr: {formatT(arrTime)}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Waypoints & Inter-POI Transit Steps */}
            {path.map((scheduledPoi: ScheduledPoi, pIdx: number) => {
              const name = scheduledPoi.poi?.name || 'Unknown Waypoint';
              const time = scheduledPoi.scheduled_start || scheduledPoi.arrival_time || '--:--';
              const duration = scheduledPoi.poi?.duration_mins ? `${scheduledPoi.poi.duration_mins}m` : '';
              const category = scheduledPoi.poi?.category;
              const isLast = pIdx === path.length - 1;
              const transitFromPrev = scheduledPoi.transit_from_previous;
              const prevName = pIdx > 0 ? path[pIdx - 1].poi?.name || 'Previous Stop' : undefined;

              return (
                <React.Fragment key={pIdx}>
                  {/* Transit from previous POI (Turn-by-turn routing steps & fare) */}
                  {pIdx > 0 && transitFromPrev && (
                    <TransitLegView
                      transitLeg={transitFromPrev}
                      originName={prevName}
                      destinationName={name}
                    />
                  )}

                  {/* Waypoint Node */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      position: 'relative',
                      marginBottom: isLast ? '0' : '0.5rem',
                    }}
                  >
                    {/* Timeline line connecting to next waypoint */}
                    {!isLast && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '7px',
                          top: '24px',
                          bottom: '-16px',
                          width: '2px',
                          background: 'var(--color-border)',
                        }}
                      />
                    )}

                    {/* Node circle */}
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: 'var(--color-accent-primary)',
                        marginTop: '4px',
                        zIndex: 1,
                      }}
                    />

                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span className="font-mono" style={{ fontWeight: 600 }}>
                            {name}
                          </span>
                          <PoiCategoryBadge category={category} name={name} size="xs" />
                        </div>
                        <span className="font-mono text-muted text-sm">{time}</span>
                      </div>
                      {duration && (
                        <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          DWELL: {duration}
                        </p>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {/* Outbound / Departure Flight (Trip End / Final Day Departure) */}
            {(() => {
              const departureFlight =
                (dayObj as any).outbound_flight ||
                (dayObj.flight_info?.direction === 'departure'
                  ? dayObj.flight_info
                  : dayIdx === days.length - 1 && dayObj.flight_info?.direction !== 'arrival' && dayIdx !== 0
                  ? dayObj.flight_info
                  : null);

              if (!departureFlight) return null;

              const origin = departureFlight.origin_iata || 'DEP';
              const dest = departureFlight.destination_iata || 'ARR';
              const depTime = departureFlight.departure_time || '--:--';
              let arrTime = departureFlight.arrival_time;
              if (!arrTime && departureFlight.departure_time && departureFlight.flight_duration_minutes) {
                try {
                  const d = new Date(departureFlight.departure_time);
                  if (!isNaN(d.getTime())) {
                    arrTime = new Date(d.getTime() + departureFlight.flight_duration_minutes * 60000).toISOString();
                  }
                } catch {}
              }

              const formatT = (t?: string) => {
                if (!t || t === '--:--') return '--:--';
                if (t.includes('T')) return t.split('T')[1].substring(0, 5);
                if (t.includes(' ')) return t.split(' ')[1].substring(0, 5);
                return t.substring(0, 5);
              };

              return (
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', marginTop: '1rem' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: 'var(--color-accent-primary)',
                      marginTop: '4px',
                      zIndex: 1,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="font-mono" style={{ fontWeight: 600 }}>
                          Flight to {dest} (Departure)
                        </span>
                        <PoiCategoryBadge category="flight" name="Flight" size="xs" />
                      </div>
                      <span className="font-mono text-muted text-sm">
                        {formatT(depTime)}
                      </span>
                    </div>
                    <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {origin} → {dest} • Dep: {formatT(depTime)} | Arr: {formatT(arrTime)}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Subtle disclaimer for public transit fares */}
      {hasTransit && (
        <div
          data-testid="timeline-transit-disclaimer"
          style={{
            marginTop: '1.5rem',
            padding: '0.6rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-card)',
            fontSize: '0.7rem',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>ℹ️</span>
          <span>
            Notice: Public transit fares are fetched automatically and may not be 100% accurate. Please verify with local transit operators.
          </span>
        </div>
      )}
    </div>
  );
}
