'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, triggerGtfsCompileApi } from '@/utils/api';
import { notify } from '@/utils/notify';

export interface TripTransitTabProps {
  tripId?: string;
  destinationCity: string;
  selectedDay: number | 'all';
  savedPoiIds: Set<string>;
  onToggleSavePoi: (id: string) => void;
  onSelectStation?: (stationId: string, coordinates?: [number, number]) => void;
  onSelectLine?: (lineId: string) => void;
}

export type TransitSubView = 'nearby' | 'lines';
export type TransitModeFilter = 'metro' | 'rail' | 'tram' | 'bus';

export function TripTransitTab({
  tripId,
  destinationCity,
  selectedDay,
  savedPoiIds,
  onToggleSavePoi,
  onSelectStation,
  onSelectLine,
}: TripTransitTabProps) {
  // Anticipated drill-in props for Phase 4
  void savedPoiIds;
  void onToggleSavePoi;
  void onSelectStation;
  void onSelectLine;

  const [subView, setSubView] = useState<TransitSubView>('nearby');
  const [activeModes, setActiveModes] = useState<Set<TransitModeFilter>>(
    new Set(['metro', 'rail'])
  );
  const [transitStatus, setTransitStatus] = useState<string>('CHECKING');
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  // Poll status according to PLAN.md 3.1
  const fetchTransitStatus = useCallback(async () => {
    if (!destinationCity && !tripId) return;
    try {
      let endpoint = '';
      if (tripId) {
        endpoint = `/trips/${tripId}/transit-status`;
      } else {
        endpoint = `/trips/transit-status?city=${encodeURIComponent(destinationCity)}`;
      }

      const data = await apiFetch<{
        city?: string;
        gtfs_status?: string;
        status?: string;
        is_ready?: boolean;
        valid_until?: string | null;
        message?: string;
      }>(endpoint);

      const rawStatus = (
        data.gtfs_status ||
        data.status ||
        (data.is_ready ? 'READY' : 'NOT_READY')
      ).toUpperCase();

      setTransitStatus(rawStatus);
      if (data.valid_until) {
        setValidUntil(data.valid_until);
        const expiry = new Date(data.valid_until).getTime();
        setIsExpired(Number.isFinite(expiry) && expiry < Date.now());
      }
      if (data.message) setStatusMessage(data.message);
    } catch {
      setTransitStatus('UNAVAILABLE');
    }
  }, [tripId, destinationCity]);

  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      if (!isCancelled) {
        await fetchTransitStatus();
      }
    };
    void run();

    let interval: NodeJS.Timeout | null = null;
    if (['BUILDING', 'QUEUED', 'CHECKING'].includes(transitStatus)) {
      interval = setInterval(() => {
        if (!isCancelled) void fetchTransitStatus();
      }, 3000);
    }
    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [fetchTransitStatus, transitStatus]);

  const handleTriggerCompile = async () => {
    if (!destinationCity) return;
    setIsCompiling(true);
    setTransitStatus('QUEUED');
    try {
      await triggerGtfsCompileApi(destinationCity);
      notify.info('Transit compilation started', `Compiling GTFS data for ${destinationCity}`);
      await fetchTransitStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start compilation';
      notify.error('Compilation failed', msg);
      setTransitStatus('FAILED');
    } finally {
      setIsCompiling(false);
    }
  };

  const toggleMode = (mode: TransitModeFilter) => {
    setActiveModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        if (next.size > 1) next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  };

  // 1. Loading / Checking state
  if (transitStatus === 'CHECKING') {
    return (
      <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>Checking transit network availability...</div>
      </div>
    );
  }

  // 2. Not Requested / Initial Empty state (PLAN.md Section 3.1)
  if (transitStatus === 'NOT_READY' || transitStatus === 'NOT_REQUESTED' || transitStatus === 'PENDING') {
    return (
      <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '24px 16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-card)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(15, 76, 92, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent-primary)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="15" rx="2" />
              <circle cx="7" cy="14" r="1" />
              <circle cx="17" cy="14" r="1" />
              <path d="M7 8h10" />
              <path d="M5 21l2-3" />
              <path d="M19 21l-2-3" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Transit schedules not yet prepared
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', maxWidth: '280px', lineHeight: 1.4 }}>
              Prepare official GTFS schedule data for {destinationCity || 'this city'} to explore stations, lines, and departure frequencies.
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-prepare-transit"
            disabled={isCompiling}
            onClick={handleTriggerCompile}
            style={{
              marginTop: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-accent-primary)',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isCompiling ? 'not-allowed' : 'pointer',
              opacity: isCompiling ? 0.7 : 1,
            }}
          >
            {isCompiling ? 'Queueing Build...' : `Prepare Transit for ${destinationCity}`}
          </button>
        </div>
      </div>
    );
  }

  // 3. QUEUED / BUILDING / DERIVING state (PLAN.md Section 3.1)
  if (transitStatus === 'BUILDING' || transitStatus === 'QUEUED') {
    return (
      <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '28px 16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-card)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(15, 76, 92, 0.2)',
              borderTopColor: 'var(--color-accent-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Preparing transit data for {destinationCity}...
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Compiling network routes, pruning stations, and indexing schedule offsets.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. FAILED state (PLAN.md Section 3.1)
  if (transitStatus === 'FAILED') {
    return (
      <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '24px 16px',
            borderRadius: '12px',
            border: '1px solid var(--color-danger, #EF4444)',
            background: 'var(--color-surface-card)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ color: 'var(--color-danger, #EF4444)', fontSize: '24px' }}>⚠️</div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Transit feed compilation failed
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              {statusMessage || 'Unable to download or derive GTFS network for this city.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleTriggerCompile}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Build
          </button>
        </div>
      </div>
    );
  }

  // 5. UNAVAILABLE (Limited Mode) (PLAN.md Section 3.1 & 4)
  if (transitStatus === 'UNAVAILABLE') {
    return (
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            fontSize: '12px',
            color: 'var(--color-text-primary)',
            lineHeight: 1.4,
          }}
        >
          <strong>Limited Mode:</strong> No open public schedule feed is available for {destinationCity}. Public transit lines and departure times cannot be derived.
        </div>
      </div>
    );
  }

  // 6. READY / NORMAL STATE (PLAN.md Section 3.1, 9)
  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Expired / Notice Banner if applicable */}
      {isExpired && validUntil && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            fontSize: '11px',
            color: 'var(--color-danger, #EF4444)',
          }}
        >
          Feed schedule covered until {validUntil.split('T')[0]}. Departures may reflect typical service spans.
        </div>
      )}

      {/* Segmented Control: [ Nearby | Lines ] */}
      <div
        style={{
          display: 'flex',
          background: 'var(--color-surface-sunken, rgba(0,0,0,0.04))',
          borderRadius: '8px',
          padding: '2px',
        }}
      >
        <button
          type="button"
          data-testid="transit-subview-nearby"
          onClick={() => setSubView('nearby')}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '12px',
            fontWeight: subView === 'nearby' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: subView === 'nearby' ? 'var(--color-surface-card)' : 'transparent',
            color: subView === 'nearby' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            boxShadow: subView === 'nearby' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Nearby {selectedDay !== 'all' ? `(Day ${selectedDay})` : ''}
        </button>
        <button
          type="button"
          data-testid="transit-subview-lines"
          onClick={() => setSubView('lines')}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '12px',
            fontWeight: subView === 'lines' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: subView === 'lines' ? 'var(--color-surface-card)' : 'transparent',
            color: subView === 'lines' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            boxShadow: subView === 'lines' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Lines
        </button>
      </div>

      {/* Mode Filter Chips: [ Metro, Rail, Tram, Bus ] */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {(['metro', 'rail', 'tram', 'bus'] as TransitModeFilter[]).map((mode) => {
          const isActive = activeModes.has(mode);
          return (
            <button
              key={mode}
              type="button"
              data-testid={`mode-filter-${mode}`}
              onClick={() => toggleMode(mode)}
              style={{
                padding: '3px 9px',
                borderRadius: '6px',
                border: isActive ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                background: isActive ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Subview Content Placeholder (Populated in Phase 4) */}
      {subView === 'nearby' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Stations near your plan
          </div>
          <div
            style={{
              padding: '24px 16px',
              borderRadius: '8px',
              border: '1px dashed var(--color-border)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
            }}
          >
            Derived stations will appear here grouped by lodging and day stops.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Transit Lines ({destinationCity})
          </div>
          <div
            style={{
              padding: '24px 16px',
              borderRadius: '8px',
              border: '1px dashed var(--color-border)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
            }}
          >
            Derived network lines, official colors, and pattern sequences will appear here.
          </div>
        </div>
      )}
    </div>
  );
}
