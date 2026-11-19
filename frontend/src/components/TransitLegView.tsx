"use client";

import React, { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { TransitLeg, TransitStep, TransitRecommendation } from '../types/domain';
import { apiFetch } from '@/utils/api';
import {
  TransitIcon,
  WalkIcon,
  TransferIcon,
  ArrivalIcon,
  StopwatchIcon,
  RulerIcon,
  BulbIcon,
  TicketIcon,
} from './icons';

interface TransitLegViewProps {
  transitLeg?: TransitLeg | null;
  originName?: string;
  destinationName?: string;
  defaultExpanded?: boolean;
  city?: string;
  tripId?: string;
  onInspectPoi?: (id: string, fallbackData?: any) => void;
  onSelectTransitLine?: (lineData: any) => void;
}

export function TransitLegView({
  transitLeg,
  originName,
  destinationName,
  defaultExpanded = false,
  city,
  tripId,
  onInspectPoi,
  onSelectTransitLine,
}: TransitLegViewProps) {
  const { t } = useTranslation();
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const isExpanded = userExpanded !== null ? userExpanded : defaultExpanded;

  const duration_mins = transitLeg?.duration_mins ?? 0;
  const cost_eur = transitLeg?.cost_eur ?? 0;
  const cost_is_estimated = transitLeg?.cost_is_estimated ?? false;
  const price_source = transitLeg?.price_source;
  const mode = transitLeg?.mode ?? 'multimodal';
  const steps = transitLeg?.steps ?? [];
  const airport_surcharge_eur = transitLeg?.airport_surcharge_eur ?? 0;

  // Extract unique transit lines from steps (e.g. Line 1, Line 10)
  const transitLines = Array.from(
    new Set(
      steps
        .map((s) => s.transit_line)
        .filter((l): l is string => Boolean(l && l.trim().length > 0))
    )
  );

  const isTransit = mode === 'transit' || transitLines.length > 0 || steps.some((s) => s.type === 'transit' || s.type === 'transit_board');

  const getStepIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'transit':
      case 'transit_board':
        return <TransitIcon size={14} color="var(--color-accent-primary)" />;
      case 'transit_alight':
        return <ArrivalIcon size={14} color="var(--color-success)" />;
      case 'transfer':
      case 'transit_transfer':
        return <TransferIcon size={14} color="var(--color-accent-warning)" />;
      case 'walk':
      default:
        return <WalkIcon size={14} color="var(--color-text-muted)" />;
    }
  };

  const handleLineClick = async (lineName: string, explicitColor?: string) => {
    const cleanLine = lineName.replace(/^line\s+/i, '').trim();
    const targetCity = city || '';
    try {
      let endpoint = '';
      if (targetCity) {
        endpoint = `/transit/${encodeURIComponent(targetCity.toLowerCase())}/lines/${encodeURIComponent(cleanLine)}`;
      } else if (tripId) {
        endpoint = `/trips/${tripId}/transit/lines/${encodeURIComponent(cleanLine)}`;
      }

      if (endpoint) {
        const detail = await apiFetch<{
          id: string;
          short_name?: string;
          color?: string;
          patterns?: Array<{
            geometry?: { coordinates: [number, number][] };
            stops?: Array<{ station_id: string; name: string; lat: number; lon: number }>;
          }>;
        }>(endpoint);

        if (detail && detail.patterns && detail.patterns.length > 0) {
          const primary = detail.patterns[0];
          const patternStops = primary.stops || [];
          const polyline: [number, number][] =
            primary.geometry?.coordinates && primary.geometry.coordinates.length > 0
              ? primary.geometry.coordinates
              : patternStops.map((s) => [s.lat, s.lon] as [number, number]);

          const activeLineData = {
            line: detail.short_name || detail.id || cleanLine,
            color: detail.color || explicitColor || '#007AFF',
            polyline,
            stations: patternStops.map((s) => ({
              id: s.station_id || `gtfs:${targetCity}:${s.name}`,
              name: s.name,
              lat: s.lat,
              lng: s.lon,
            })),
          };
          onSelectTransitLine?.(activeLineData);
          window.dispatchEvent(
            new CustomEvent('paladio:show-transit-line', { detail: activeLineData })
          );
          return;
        }
      }
    } catch (e) {
      console.warn('Could not fetch line patterns:', e);
    }

    // Fallback: If line cannot be retrieved from GTFS, assemble from all steps for this line
    const matchingSteps = steps.filter((s) => s.transit_line === lineName);
    const primaryStep = matchingSteps[0] || steps.find((s) => s.transit_line);
    const lineCoords = primaryStep?.geometry || [];

    const lineStations: Array<{ id: string; name: string; lat: number; lng: number }> = [];
    const seenNames = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.transit_line !== lineName) continue;

      // 1. Boarding station
      if (s.station_name && !seenNames.has(s.station_name)) {
        seenNames.add(s.station_name);
        const lat = s.geometry?.[0]?.[0] || lineCoords[0]?.[0] || 0;
        const lng = s.geometry?.[0]?.[1] || lineCoords[0]?.[1] || 0;
        lineStations.push({
          id: `gtfs:${targetCity}:${s.station_name}`,
          name: s.station_name,
          lat,
          lng,
        });
      }

      // 2. Intermediate stops
      if (s.intermediate_stop_details && s.intermediate_stop_details.length > 0) {
        for (const isd of s.intermediate_stop_details) {
          if (isd.name && !seenNames.has(isd.name)) {
            seenNames.add(isd.name);
            lineStations.push({
              id: `gtfs:${targetCity}:${isd.name}`,
              name: isd.name,
              lat: typeof isd.lat === 'number' ? isd.lat : 0,
              lng: typeof isd.lon === 'number' ? isd.lon : 0,
            });
          }
        }
      } else if (s.intermediate_stops && s.intermediate_stops.length > 0) {
        for (const isName of s.intermediate_stops) {
          if (isName && !seenNames.has(isName)) {
            seenNames.add(isName);
            lineStations.push({
              id: `gtfs:${targetCity}:${isName}`,
              name: isName,
              lat: 0,
              lng: 0,
            });
          }
        }
      }

      // 3. Alighting / destination station from next step
      const nextStep = steps[i + 1];
      if (nextStep && nextStep.station_name && !seenNames.has(nextStep.station_name)) {
        seenNames.add(nextStep.station_name);
        const lat = nextStep.geometry?.[0]?.[0] || lineCoords[lineCoords.length - 1]?.[0] || 0;
        const lng = nextStep.geometry?.[0]?.[1] || lineCoords[lineCoords.length - 1]?.[1] || 0;
        lineStations.push({
          id: `gtfs:${targetCity}:${nextStep.station_name}`,
          name: nextStep.station_name,
          lat,
          lng,
        });
      }
    }

    const activeLineData = {
      line: cleanLine,
      color: explicitColor || primaryStep?.route_color || '#007AFF',
      polyline: lineCoords,
      stations: lineStations,
    };
    onSelectTransitLine?.(activeLineData);
    window.dispatchEvent(
      new CustomEvent('paladio:show-transit-line', { detail: activeLineData })
    );
  };

  const handleStationClick = (
    stationName: string,
    lat?: number,
    lon?: number,
    stepContext?: Partial<TransitStep>
  ) => {
    const targetCity = city || '';
    const stableId = `gtfs:${targetCity}:${stationName}`;
    const lineName = stepContext?.transit_line;
    const lineColor = stepContext?.route_color || '#007AFF';
    const headsign = stepContext?.headsign || '';

    const payload = {
      id: stableId,
      name: stationName,
      city: targetCity,
      category: 'transit',
      lat: lat ?? 0,
      lng: lon ?? 0,
      transit_info: {
        lines: lineName ? [lineName] : [],
        station_type: 'station',
      },
      serving_lines: lineName
        ? [
            {
              line_id: lineName,
              short_name: lineName,
              headsign,
              color: lineColor,
              mode: 'transit',
            },
          ]
        : [],
      departure_time: stepContext?.departure_time,
      arrival_time: stepContext?.arrival_time,
      instruction: stepContext?.instruction,
    };
    if (onInspectPoi) {
      onInspectPoi(stableId, payload);
    }
    window.dispatchEvent(
      new CustomEvent('paladio:inspect-poi', {
        detail: { id: stableId, fallbackData: payload },
      })
    );
  };

  // Structured transit stations flow for public transport
  const stationFlow = useMemo(() => {
    if (!isTransit || steps.length === 0) return null;

    interface StationItem {
      name: string;
      role: 'board' | 'transfer' | 'alight' | 'intermediate';
      line?: string;
      color?: string;
      textColor?: string;
      headsign?: string;
      lat?: number;
      lon?: number;
      stepContext?: Partial<TransitStep>;
    }

    const stations: StationItem[] = [];
    const intermediateStops: StationItem[] = [];

    steps.forEach((step, idx) => {
      const isBoard =
        step.type === 'transit_board' ||
        (step.type === 'transit' && !stations.some((s) => s.role === 'board'));
      const isTransfer = step.type === 'transfer' || step.type === 'transit_transfer';
      const isAlight = step.type === 'transit_alight';

      if (step.station_name) {
        if (isBoard && !stations.some((s) => s.role === 'board')) {
          stations.push({
            name: step.station_name,
            role: 'board',
            line: step.transit_line || undefined,
            color: step.route_color || undefined,
            textColor: step.route_text_color || undefined,
            headsign: step.headsign || undefined,
            lat: step.geometry?.[0]?.[0],
            lon: step.geometry?.[0]?.[1],
            stepContext: step,
          });
        } else if (isTransfer) {
          stations.push({
            name: step.station_name,
            role: 'transfer',
            line: step.transit_line || undefined,
            color: step.route_color || undefined,
            textColor: step.route_text_color || undefined,
            headsign: step.headsign || undefined,
            lat: step.geometry?.[0]?.[0],
            lon: step.geometry?.[0]?.[1],
            stepContext: step,
          });
        } else if (
          isAlight ||
          idx === steps.length - 1 ||
          (idx === steps.length - 2 && steps[steps.length - 1].type === 'walk')
        ) {
          stations.push({
            name: step.station_name,
            role: 'alight',
            line: step.transit_line || undefined,
            color: step.route_color || undefined,
            textColor: step.route_text_color || undefined,
            lat: step.geometry?.[0]?.[0],
            lon: step.geometry?.[0]?.[1],
            stepContext: step,
          });
        }
      }

      // Collect intermediate stops if present
      if (step.intermediate_stop_details && step.intermediate_stop_details.length > 0) {
        step.intermediate_stop_details.forEach((isd) => {
          if (isd.name && !intermediateStops.some((s) => s.name === isd.name)) {
            intermediateStops.push({
              name: isd.name,
              role: 'intermediate',
              line: step.transit_line || undefined,
              color: step.route_color || undefined,
              lat: typeof isd.lat === 'number' ? isd.lat : undefined,
              lon: typeof isd.lon === 'number' ? isd.lon : undefined,
              stepContext: step,
            });
          }
        });
      } else if (step.intermediate_stops && step.intermediate_stops.length > 0) {
        step.intermediate_stops.forEach((stopName) => {
          if (stopName && !intermediateStops.some((s) => s.name === stopName)) {
            intermediateStops.push({
              name: stopName,
              role: 'intermediate',
              line: step.transit_line || undefined,
              color: step.route_color || undefined,
              stepContext: step,
            });
          }
        });
      }
    });

    // Fallback: If no board or alight explicitly identified by type, pick from steps having station_name
    if (stations.length === 0) {
      const stepsWithStation = steps.filter((s) => Boolean(s.station_name));
      if (stepsWithStation.length > 0) {
        const first = stepsWithStation[0];
        stations.push({
          name: first.station_name!,
          role: 'board',
          line: first.transit_line || undefined,
          color: first.route_color || undefined,
          textColor: first.route_text_color || undefined,
          headsign: first.headsign || undefined,
          lat: first.geometry?.[0]?.[0],
          lon: first.geometry?.[0]?.[1],
          stepContext: first,
        });
        if (stepsWithStation.length > 1) {
          const last = stepsWithStation[stepsWithStation.length - 1];
          stations.push({
            name: last.station_name!,
            role: 'alight',
            line: last.transit_line || undefined,
            color: last.route_color || undefined,
            textColor: last.route_text_color || undefined,
            lat: last.geometry?.[0]?.[0],
            lon: last.geometry?.[0]?.[1],
            stepContext: last,
          });
        }
      }
    }

    return {
      keyStations: stations,
      intermediateStops,
    };
  }, [isTransit, steps]);

  if (!transitLeg) {
    return null;
  }

  return (
    <div
      data-testid="transit-leg-view"
      title={originName && destinationName ? `${originName} → ${destinationName}` : undefined}
      style={{
        margin: isExpanded ? '0.5rem 0 0.85rem 1.25rem' : '0.25rem 0 0.35rem 1.25rem',
        padding: isExpanded ? '0.6rem 0.85rem' : '0.4rem 0.65rem',
        borderRadius: '10px',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        fontSize: isExpanded ? '0.825rem' : '0.75rem',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
        cursor: steps.length > 0 && !isExpanded ? 'pointer' : 'default',
        transition: 'padding 0.15s ease, margin 0.15s ease',
      }}
    >
      {/* Connector line to the timeline */}
      <div
        style={{
          position: 'absolute',
          left: '-19px',
          top: '50%',
          width: '18px',
          height: '2px',
          background: 'var(--color-border)',
        }}
      />

      {/* Header / Summary Bar */}
      <div
        onClick={steps.length > 0 ? () => setUserExpanded(!isExpanded) : undefined}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: isExpanded ? '0.5rem' : '0.35rem',
          cursor: steps.length > 0 ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {isTransit ? (
              <TransitIcon size={16} color="var(--color-accent-primary)" />
            ) : (
              <WalkIcon size={16} color="var(--color-text-muted)" />
            )}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {isTransit ? t('transit.public_transit_label') : t('transit.walk_label')}
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('transit.mins_upper', { count: duration_mins })}</span>

          {/* Transit Line Chips */}
          {transitLines.map((line, idx) => {
            const stepWithColor = steps.find((s) => s.transit_line === line);
            const chipColor = stepWithColor?.route_color || 'var(--color-accent-primary)';
            const chipTextColor = stepWithColor?.route_text_color || '#FFFFFF';
            const displayLabel =
              line.toLowerCase() === 'transit'
                ? t('transit.transit_chip_label')
                : line.toLowerCase().includes('line') ||
                  line.toLowerCase().includes('metro') ||
                  line.toLowerCase().includes('tram') ||
                  line.toLowerCase().includes('rer')
                  ? line.toUpperCase()
                  : t('transit.line_chip_label', { line });

            return (
              <button
                key={idx}
                type="button"
                data-testid="transit-line-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLineClick(line, stepWithColor?.route_color || undefined);
                }}
                title={t('transit.show_line_route_title', { line: displayLabel })}
                style={{
                  background: chipColor,
                  color: chipTextColor,
                  border: 'none',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  transition: 'transform 0.15s ease, filter 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.filter = 'brightness(1.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
              >
                {displayLabel}
              </button>
            );
          })}

          {/* Fare / Cost Badge */}
          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
          {cost_eur > 0 ? (
            <span
              title={t('transit.fare_disclaimer_short')}
              style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
            >
              {cost_eur.toFixed(2)} €
            </span>
          ) : (
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{t('transit.free_upper')}</span>
          )}

          {airport_surcharge_eur > 0 && (
            <span
              data-testid="airport-surcharge-badge"
              style={{
                fontSize: '0.65rem',
                background: 'rgba(15, 76, 92, 0.1)',
                color: 'var(--color-accent-primary)',
                border: '1px solid var(--color-accent-teal-soft)',
                padding: '1px 5px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                letterSpacing: '0.3px',
              }}
            >
              {t('transit.airport_surcharge_included', { amount: airport_surcharge_eur.toFixed(2) })}
            </span>
          )}

          {price_source && price_source.startsWith('official_') && (
            <span
              data-testid="official-tariff-source"
              style={{
                fontSize: '0.65rem',
                color: 'var(--color-text-muted)',
                fontStyle: 'italic',
              }}
            >
              {t('transit.official_tariff', { source: price_source.replace('official_', '').replace(/_/g, ' ').toUpperCase() })}
            </span>
          )}

          {cost_is_estimated && (
            <span
              data-testid="estimated-fare-badge"
              style={{
                fontSize: '0.65rem',
                background: 'var(--color-accent-warning-bg)',
                color: 'var(--color-accent-warning)',
                border: '1px solid var(--color-accent-warning-border)',
                padding: '1px 5px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 500,
              }}
            >
              {t('transit.estimated_fare_badge')}
            </span>
          )}
        </div>

        {/* Expand / Collapse Button */}
        {steps.length > 0 && (
          <button
            type="button"
            data-testid="toggle-transit-steps-btn"
            onClick={(e) => {
              e.stopPropagation();
              setUserExpanded(!isExpanded);
            }}
            aria-expanded={isExpanded}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-accent-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 4px',
            }}
          >
            {isExpanded ? t('transit.hide_directions') : t('transit.show_directions', { count: steps.length })}
          </button>
        )}
      </div>

      {/* Tactical Transit Stations Route */}
      {isExpanded && stationFlow && stationFlow.keyStations.length > 0 && (
        <div
          data-testid="transit-stations-to-go"
          style={{
            marginTop: '0.65rem',
            padding: '8px 10px',
            background: 'rgba(15, 76, 92, 0.04)',
            borderRadius: 'var(--radius-sm, 8px)',
            border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.68rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-accent-teal-deep, #0F4C5C)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <TransitIcon size={12} color="currentColor" />
              <span>{t('transit.stations_to_go')}</span>
            </span>
            {stationFlow.intermediateStops.length > 0 && (
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, fontSize: '0.65rem' }}>
                {t('transit.stops_count', { count: stationFlow.intermediateStops.length })}
              </span>
            )}
          </div>

          {/* Interactive Stations Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '2px' }}>
            {stationFlow.keyStations.map((st, sIdx) => {
              const isBoard = st.role === 'board';
              const isAlight = st.role === 'alight';
              const dotColor = isBoard ? '#10B981' : isAlight ? '#EF4444' : '#F59E0B';
              const roleLabel = isBoard ? t('transit.board_at') : isAlight ? t('transit.alight_at') : t('transit.transfer_at');

              return (
                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                  {/* Status Indicator Dot */}
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: `0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 4px ${dotColor}`,
                      flexShrink: 0,
                    }}
                  />

                  {/* Role text */}
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--color-text-muted)',
                      minWidth: '65px',
                    }}
                  >
                    {roleLabel}:
                  </span>

                  {/* Clickable Station Badge */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStationClick(st.name, st.lat, st.lon, st.stepContext);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'var(--color-surface-card)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-accent-primary, #0F4C5C)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary, #0F4C5C)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    title={t('transit.inspect_station_title', { name: st.name })}
                  >
                    <span>{st.name}</span>
                  </button>

                  {/* Line / Direction Chip */}
                  {st.line && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: st.color || 'var(--color-accent-teal-soft, rgba(15, 76, 92, 0.15))',
                        color: st.textColor || '#FFFFFF',
                      }}
                    >
                      {st.line}
                    </span>
                  )}
                  {st.headsign && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '150px',
                      }}
                    >
                      → {st.headsign}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Intermediate Stops Row (if any) */}
            {stationFlow.intermediateStops.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  paddingLeft: '15px',
                  fontSize: '0.675rem',
                  color: 'var(--color-text-secondary)',
                  flexWrap: 'wrap',
                  marginTop: '2px',
                }}
              >
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  {t('transit.via_label')}
                </span>
                {stationFlow.intermediateStops.map((ist, isIdx) => (
                  <React.Fragment key={isIdx}>
                    {isIdx > 0 && <span style={{ opacity: 0.5 }}>→</span>}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStationClick(ist.name, ist.lat, ist.lon, ist.stepContext);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '0 2px',
                        color: 'var(--color-accent-primary, #0F4C5C)',
                        fontSize: '0.675rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textDecorationColor: 'rgba(15, 76, 92, 0.35)',
                      }}
                      title={t('transit.inspect_stop_title', { name: ist.name })}
                    >
                      {ist.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded Turn-by-Turn Steps */}
      {isExpanded && steps.length > 0 && (
        <div
          data-testid="transit-steps-container"
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.6rem',
            borderTop: '1px dashed var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {steps.map((step: TransitStep, idx: number) => {
            const icon = getStepIcon(step.type);
            return (
              <div
                key={idx}
                data-testid={`transit-step-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '3px' }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--color-text-primary)' }}>
                    <span style={{ fontWeight: 600, marginRight: '6px' }}>{idx + 1}.</span>
                    {step.instruction}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      marginTop: '2px',
                      display: 'flex',
                      gap: '0.5rem',
                    }}
                  >
                    {step.duration_mins > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <StopwatchIcon size={11} color="var(--color-text-muted)" /> {step.duration_mins}m
                      </span>
                    )}
                    {step.distance_km > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <RulerIcon size={11} color="var(--color-text-muted)" />{' '}
                        {step.distance_km < 1
                          ? `${Math.round(step.distance_km * 1000)}m`
                          : `${step.distance_km} km`}
                      </span>
                    )}
                    {step.transit_line && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLineClick(step.transit_line!, step.route_color || undefined);
                        }}
                        title={t('transit.inspect_line_title', { line: step.transit_line })}
                        style={{
                          background: step.route_color || 'rgba(15, 76, 92, 0.12)',
                          color:
                            step.route_text_color ||
                            (step.route_color ? '#FFFFFF' : 'var(--color-accent-primary)'),
                          border: 'none',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {step.transit_line}
                      </button>
                    )}
                    {step.headsign && <span>{t('transit.towards_headsign', { headsign: step.headsign })}</span>}
                    {step.station_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('transit.station_label')}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStationClick(step.station_name!, step.geometry?.[0]?.[0], step.geometry?.[0]?.[1], step);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-accent-primary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: 'inherit',
                          }}
                          title={t('transit.inspect_name_title', { name: step.station_name })}
                        >
                          {step.station_name}
                        </button>
                      </span>
                    )}
                  </div>
                  {step.intermediate_stops && step.intermediate_stops.length > 0 && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: 'rgba(15, 76, 92, 0.05)',
                        borderLeft: `2px solid ${step.route_color || 'var(--color-accent-primary)'}`,
                        fontSize: '0.68rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginRight: '4px' }}>
                        {t('transit.intermediate_stops_count', { count: step.intermediate_stops.length })}
                      </span>
                      {step.intermediate_stops.map((stopName, sIdx) => {
                        const detailObj = step.intermediate_stop_details?.find((d) => d.name === stopName);
                        return (
                          <React.Fragment key={sIdx}>
                            {sIdx > 0 && <span style={{ opacity: 0.6, margin: '0 3px' }}>→</span>}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStationClick(stopName, detailObj?.lat, detailObj?.lon, step);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '1px 3px',
                                borderRadius: '3px',
                                color: 'var(--color-accent-primary)',
                                fontWeight: 600,
                                fontSize: 'inherit',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textDecorationColor: 'rgba(15, 76, 92, 0.4)',
                              }}
                              title={t('transit.inspect_name_title', { name: stopName })}
                            >
                              {stopName}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div
            data-testid="transit-steps-disclaimer"
            style={{
              marginTop: '0.4rem',
              paddingTop: '0.4rem',
              borderTop: '1px dashed var(--color-border)',
              fontSize: '0.675rem',
              color: 'var(--color-text-muted)',
              fontStyle: 'italic',
              opacity: 0.85,
            }}
          >
            {t('transit.steps_disclaimer')}
          </div>
        </div>
      )}
    </div>
  );
}

interface TransitRecommendationCardProps {
  recommendation?: TransitRecommendation | null;
}

export function TransitRecommendationCard({ recommendation }: TransitRecommendationCardProps) {
  const { t } = useTranslation();
  if (!recommendation) return null;

  const isPassRecommended = recommendation.type === '24H_PASS_RECOMMENDED';

  return (
    <div
      data-testid="transit-recommendation-card"
      style={{
        margin: '0.75rem 0 1rem 0',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-sm)',
        background: isPassRecommended ? 'rgba(15, 76, 92, 0.08)' : 'var(--color-surface-card)',
        border: `1px solid ${isPassRecommended ? 'var(--color-accent-teal-soft)' : 'var(--color-border)'}`,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {isPassRecommended ? (
            <BulbIcon size={16} color="var(--color-accent-primary)" />
          ) : (
            <TicketIcon size={16} color="var(--color-accent-primary)" />
          )}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: isPassRecommended ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
            fontSize: '0.85rem',
          }}
        >
          {isPassRecommended ? t('transit.pass_advisory_title') : t('transit.fare_summary_title')}
        </span>
      </div>

      <p style={{ color: 'var(--color-text-primary)', margin: '0.25rem 0', lineHeight: 1.4 }}>
        {recommendation.message || (
          isPassRecommended
            ? t('transit.pass_advisory_msg', {
                passName: recommendation.pass_name || t('transit.default_pass_name'),
                passPrice: recommendation.pass_price_eur?.toFixed(2) ?? '',
                singleTotal: recommendation.single_tickets_total_eur.toFixed(2),
                savings: recommendation.savings_eur.toFixed(2),
              })
            : t('transit.single_tickets_optimal_msg', {
                total: recommendation.single_tickets_total_eur.toFixed(2),
              })
        )}
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          fontSize: '0.725rem',
          color: 'var(--color-text-muted)',
          marginTop: '0.4rem',
        }}
      >
        <span>{t('transit.individual_tickets_cost', { amount: recommendation.single_tickets_total_eur.toFixed(2) })}</span>
        {recommendation.pass_price_eur != null && (
          <span>{t('transit.pass_price_cost', { amount: recommendation.pass_price_eur.toFixed(2) })}</span>
        )}
        {recommendation.savings_eur > 0 && (
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
            {t('transit.estimated_savings_cost', { amount: recommendation.savings_eur.toFixed(2) })}
          </span>
        )}
      </div>

      <div
        data-testid="transit-fare-disclaimer"
        style={{
          marginTop: '0.5rem',
          paddingTop: '0.4rem',
          borderTop: isPassRecommended ? '1px dashed var(--color-accent-teal-soft)' : '1px dashed var(--color-border)',
          fontSize: '0.675rem',
          color: 'var(--color-text-muted)',
          fontStyle: 'italic',
          opacity: 0.85,
        }}
      >
        {t('transit.card_disclaimer')}
      </div>
    </div>
  );
}
