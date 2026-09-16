import React from 'react';

import { OptimizationResult, DayOutput, ScheduledPoi } from '../types/domain';
import { PoiCategoryBadge } from './PoiCategoryBadge';
import { TransitLegView, TransitRecommendationCard } from './TransitLegView';

interface TripTimelineProps {
  itinerary: OptimizationResult | null;
}

export function TripTimeline({ itinerary }: TripTimelineProps) {
  if (!itinerary) {
    return <div style={{ padding: '1rem', color: 'var(--color-muted)' }}>No route data available.</div>;
  }

  // Support both standard multi-day { days: [...] } and flat single-day fallback { path: [...] }
  const days: DayOutput[] = itinerary.days && itinerary.days.length > 0
    ? itinerary.days
    : (itinerary as any).path
      ? [{ day: 1, itinerary: { path: (itinerary as any).path } }]
      : [];

  if (days.length === 0) {
    return <div style={{ padding: '1rem', color: 'var(--color-muted)' }}>No route data available.</div>;
  }

  return (
    <div style={{ padding: '1rem' }}>
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
            {transitRec && <TransitRecommendationCard recommendation={transitRec} />}

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
