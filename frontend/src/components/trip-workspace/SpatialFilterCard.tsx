'use client';

import React from 'react';
import { RadarIcon, CloseIcon } from '@/components/icons';
import type { SpatialCircleFilter } from './TripMapView';

export interface SpatialFilterCardProps {
  spatialCircle?: SpatialCircleFilter | null;
  onSpatialCircleChange?: (circle: SpatialCircleFilter) => void;
  isDroppingWaypoint?: boolean;
  onToggleDropWaypoint?: () => void;
  onClearSpatialCircle?: () => void;
}

export function formatRadiusLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function SpatialFilterCard({
  spatialCircle,
  onSpatialCircleChange,
  isDroppingWaypoint,
  onToggleDropWaypoint,
  onClearSpatialCircle,
}: SpatialFilterCardProps) {
  if (!spatialCircle && !isDroppingWaypoint) {
    return null;
  }

  if (isDroppingWaypoint && !spatialCircle) {
    return (
      <div
        data-testid="dropping-waypoint-prompt"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: 'rgba(15, 76, 92, 0.08)',
          border: '1.5px dashed var(--color-accent-primary, #0F4C5C)',
          animation: 'pulse 2s infinite ease-in-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RadarIcon size={16} color="var(--color-accent-primary, #0F4C5C)" />
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--color-accent-primary, #0F4C5C)',
              }}
            >
              Drop Waypoint Mode Active
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Click anywhere on the map to place radius center
            </div>
          </div>
        </div>
        {onToggleDropWaypoint && (
          <button
            type="button"
            onClick={onToggleDropWaypoint}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-card, #FFFFFF)',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  if (!spatialCircle) {
    return null;
  }

  const presets = [300, 800, 1500, 3000];

  return (
    <div
      data-testid="spatial-filter-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '12px',
        background: 'var(--color-surface-subtle, #FAFAFA)',
        border: '1px solid var(--color-accent-primary, #0F4C5C)',
        boxShadow: '0 2px 8px rgba(15, 76, 92, 0.08)',
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RadarIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-accent-primary, #0F4C5C)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            Waypoint Area Filter
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '1px 6px',
              borderRadius: '9999px',
              background: 'var(--color-accent-primary, #0F4C5C)',
              color: '#FFFFFF',
            }}
          >
            {formatRadiusLabel(spatialCircle.radiusMeters)}
          </span>
        </div>

        {onClearSpatialCircle && (
          <button
            type="button"
            data-testid="clear-spatial-circle-btn"
            onClick={onClearSpatialCircle}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            title="Clear waypoint area filter"
          >
            <CloseIcon size={11} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Center Coordinate Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <span>
          Center: {spatialCircle.lat.toFixed(4)}, {spatialCircle.lng.toFixed(4)}
        </span>
        <span style={{ fontSize: '10px', fontStyle: 'italic', fontFamily: 'inherit' }}>
          Drag handle on map to resize
        </span>
      </div>

      {/* Interactive Range Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="range"
          min="100"
          max="5000"
          step="50"
          data-testid="spatial-radius-slider"
          value={spatialCircle.radiusMeters}
          onChange={(e) => {
            const nextRadius = Number(e.target.value);
            onSpatialCircleChange?.({
              ...spatialCircle,
              radiusMeters: nextRadius,
            });
          }}
          style={{
            flex: 1,
            accentColor: 'var(--color-accent-primary, #0F4C5C)',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Preset Chips */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {presets.map((preset) => {
          const isActive = Math.abs(spatialCircle.radiusMeters - preset) < 25;
          return (
            <button
              key={preset}
              type="button"
              data-testid={`spatial-preset-${preset}`}
              onClick={() => {
                onSpatialCircleChange?.({
                  ...spatialCircle,
                  radiusMeters: preset,
                });
              }}
              style={{
                flex: 1,
                padding: '3px 0',
                borderRadius: '6px',
                border: `1px solid ${isActive ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
                background: isActive ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-surface-card, #FFFFFF)',
                color: isActive ? '#FFFFFF' : 'var(--color-text-primary)',
                fontSize: '10.5px',
                fontWeight: isActive ? 700 : 500,
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {formatRadiusLabel(preset)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
