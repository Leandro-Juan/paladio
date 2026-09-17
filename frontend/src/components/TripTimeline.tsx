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

  const handleUpgrade = async () => {
    if (upgrading) return;
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
          if (onItineraryUpdate) {
            onItineraryUpdate(data.itinerary_data);
          }
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
      {/* Discrete Toolbar Upgrade Action (Guardrails 1 & 5) */}
      {hasEstimatedTransit && !upgraded && (
        <div
          data-testid="transit-upgrade-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={upgrading}
            data-testid="upgrade-transit-btn"
            className="font-mono text-xs"
            style={{
              background: upgrading ? '#2b2b2b' : 'rgba(59, 130, 246, 0.12)',
              color: upgrading ? '#777777' : '#60a5fa',
              border: upgrading ? '1px solid #444444' : '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: '4px',
              padding: '0.4rem 0.8rem',
              cursor: upgrading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              opacity: upgrading ? 0.6 : 1,
            }}
          >
            {upgrading ? (
              <>
                <span>⏳</span>
                <span>UPGRADING TRANSIT DIRECTIONS...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>ACTUALIZAR A METRO/BUS</span>
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

            {/* Flight info if present */}
            {dayObj.flight_info && (
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
                        Flight to {dayObj.flight_info.destination_iata || 'Destination'}
                      </span>
                      <PoiCategoryBadge category="flight" name="Flight" size="xs" />
                    </div>
                    <span className="font-mono text-muted text-sm">
                      {dayObj.flight_info.departure_time || '--:--'}
                    </span>
                  </div>
                  <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    TRANSIT FLIGHT
                  </p>
                </div>
              </div>
            )}

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
          </div>
        );
      })}
    </div>
  );
}
