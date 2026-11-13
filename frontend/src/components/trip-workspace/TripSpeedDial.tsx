"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  EditIcon,
  LayersViewIcon,
  PinIcon,
} from '@/components/icons';

export interface TripSpeedDialProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onReoptimizeDay?: () => Promise<void>;
  isReoptimizing?: boolean;
  transitMode: 'simple' | 'detailed';
  onToggleTransitMode: () => void;
  selectedDay: number | 'all';
  isRightOpen?: boolean;
  dockSide?: 'left' | 'right';
  isPanelOpen?: boolean;
  panelWidth?: string;
  isDroppingWaypoint?: boolean;
  onToggleDropWaypoint?: () => void;
  spatialCircle?: { lat: number; lng: number; radiusMeters: number } | null;
  onClearSpatialCircle?: () => void;
}

export function TripSpeedDial({
  isEditMode,
  onToggleEditMode,
  onReoptimizeDay,
  isReoptimizing = false,
  transitMode,
  onToggleTransitMode,
  selectedDay,
  isRightOpen = true,
  dockSide = 'left',
  isPanelOpen = true,
  panelWidth = 'min(520px, calc(100vw - 32px))',
  isDroppingWaypoint = false,
  onToggleDropWaypoint,
  spatialCircle = null,
  onClearSpatialCircle,
}: TripSpeedDialProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  const toggleDial = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  const handleEditClick = useCallback(() => {
    onToggleEditMode();
  }, [onToggleEditMode]);

  const handleViewToggleClick = useCallback(() => {
    onToggleTransitMode();
  }, [onToggleTransitMode]);

  const isLeft = dockSide === 'left';

  // Radial offsets:
  // When docked on the left, fan into top-right quadrant (dx >= 0)
  // When docked on the right, fan into top-left quadrant (dx <= 0)
  const actions = [
    {
      id: 'edit',
      label: isEditMode ? 'EDITING ACTIVE' : 'EDIT ROUTE',
      sublabel: 'Reorder & locks',
      icon: <EditIcon size={16} color={isEditMode ? '#FFFFFF' : 'currentColor'} />,
      onClick: handleEditClick,
      isActive: isEditMode,
      disabled: false,
      testId: 'speed-dial-edit-mode',
      title: isEditMode ? 'Exit route editing mode' : 'Enter route editing mode (reorder POIs, days, and locks)',
      dx: 0,
      dy: isLeft ? -64 : -70,
      delayOpen: '0ms',
      delayClose: '60ms',
    },
    {
      id: 'waypoint',
      label: isDroppingWaypoint
        ? 'CANCEL PLACEMENT'
        : spatialCircle
        ? `CLEAR AREA (${spatialCircle.radiusMeters}M)`
        : 'DROP WAYPOINT',
      sublabel: isDroppingWaypoint
        ? 'Click map to place'
        : spatialCircle
        ? 'Click to clear filter'
        : 'Radius search filter',
      icon: (
        <PinIcon
          size={16}
          color={isDroppingWaypoint || spatialCircle ? '#FFFFFF' : 'currentColor'}
        />
      ),
      onClick: () => {
        if (spatialCircle && !isDroppingWaypoint) {
          if (onClearSpatialCircle) {
            onClearSpatialCircle();
          }
        } else if (onToggleDropWaypoint) {
          onToggleDropWaypoint();
        }
      },
      isActive: isDroppingWaypoint || !!spatialCircle,
      disabled: false,
      testId: 'speed-dial-waypoint',
      title: isDroppingWaypoint
        ? 'Cancel waypoint placement mode'
        : spatialCircle
        ? `Active radius: ${spatialCircle.radiusMeters}m (Click to clear filter)`
        : 'Drop waypoint on map to filter POIs and transit by radius',
      dx: isLeft ? 46 : -50,
      dy: isLeft ? -46 : -50,
      delayOpen: '30ms',
      delayClose: '30ms',
    },
    {
      id: 'view',
      label: transitMode === 'detailed' ? 'VIEW: DETAILED' : 'VIEW: SIMPLE',
      sublabel: transitMode === 'detailed' ? 'Full transit steps' : 'Compact waypoints',
      icon: <LayersViewIcon size={16} color={transitMode === 'detailed' ? '#FFFFFF' : 'currentColor'} />,
      onClick: handleViewToggleClick,
      isActive: transitMode === 'detailed',
      disabled: false,
      testId: 'speed-dial-view-toggle',
      title: `Switch to ${transitMode === 'simple' ? 'detailed' : 'simple'} view`,
      dx: isLeft ? 64 : -70,
      dy: 0,
      delayOpen: '60ms',
      delayClose: '0ms',
    },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        bottom: transitMode === 'detailed' ? '72px' : '24px',
        left: isLeft ? (isPanelOpen ? `calc(${panelWidth} + 28px)` : '24px') : 'auto',
        right: isLeft ? 'auto' : (isRightOpen ? 'calc(min(380px, calc(100vw - 32px)) + 24px)' : '24px'),
        transition: `${isLeft ? 'left' : 'right'} 0.28s cubic-bezier(0.23, 1, 0.32, 1), bottom 0.32s cubic-bezier(0.34, 1.25, 0.64, 1)`,
        zIndex: 1050,
        pointerEvents: 'none',
      }}
      aria-label="Trip Route Actions Dial"
    >
      <style>{`
        @keyframes activePopPulse {
          0% { transform: scale(0.92); }
          50% { transform: scale(1.14); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Origin wrapper for radial buttons and trigger */}
      <div style={{ position: 'relative', width: '44px', height: '44px', pointerEvents: 'auto' }}>
        {/* Radiating Action Buttons (Quarter-Circle Arc) */}
        {actions.map((act) => {
          const isHovered = hoveredAction === act.id;
          const translateX = isOpen ? act.dx : 0;
          const translateY = isOpen ? act.dy : 0;
          const scale = isOpen ? 1 : 0.25;
          const opacity = isOpen ? 1 : 0;

          return (
            <div
              key={act.id}
              style={{
                position: 'absolute',
                left: isLeft ? '2px' : 'auto',
                right: isLeft ? 'auto' : '2px',
                bottom: '2px',
                transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
                opacity,
                visibility: isOpen ? 'visible' : 'hidden',
                transition: `transform 0.24s cubic-bezier(0.34, 1.45, 0.64, 1) ${isOpen ? act.delayOpen : act.delayClose}, opacity 0.2s ease ${isOpen ? act.delayOpen : act.delayClose}, visibility 0.24s`,
                pointerEvents: isOpen ? 'auto' : 'none',
                zIndex: isHovered ? 1100 : 1060,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isLeft ? 'flex-start' : 'flex-end',
              }}
            >
              {/* Expandable Label Pill */}
              <div
                style={{
                  position: 'absolute',
                  ...(isLeft
                    ? {
                        left: '48px',
                        right: 'auto',
                        alignItems: 'flex-start',
                        transform: isHovered ? 'translateX(0)' : 'translateX(-8px)',
                      }
                    : {
                        right: '48px',
                        left: 'auto',
                        alignItems: 'flex-end',
                        transform: isHovered ? 'translateX(0)' : 'translateX(8px)',
                      }),
                  display: 'flex',
                  flexDirection: 'column',
                  background: act.isActive ? 'var(--color-accent-primary)' : 'var(--color-surface-card)',
                  color: act.isActive ? '#FFFFFF' : 'var(--color-text-primary)',
                  border: `1px solid ${act.isActive ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.18s ease, transform 0.18s cubic-bezier(0.23, 1, 0.32, 1)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    lineHeight: 1.2,
                    color: act.isActive ? '#FFFFFF' : 'var(--color-text-primary)',
                  }}
                >
                  {act.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.03em',
                    lineHeight: 1.1,
                    color: act.isActive ? 'rgba(255, 255, 255, 0.78)' : 'var(--color-text-muted)',
                  }}
                >
                  {act.sublabel}
                </span>
              </div>

              {/* Pure Circular Action Button */}
              <button
                type="button"
                data-testid={act.testId}
                onClick={(e) => {
                  e.stopPropagation();
                  act.onClick();
                  setIsOpen(false);
                }}
                disabled={act.disabled}
                aria-label={act.label}
                onMouseEnter={() => setHoveredAction(act.id)}
                onMouseLeave={() => setHoveredAction(null)}
                onFocus={() => setHoveredAction(act.id)}
                onBlur={() => setHoveredAction(null)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: act.isActive
                    ? 'var(--color-accent-primary)'
                    : 'var(--color-surface-card)',
                  color: act.isActive ? '#FFFFFF' : 'var(--color-text-primary)',
                  border: `1.5px solid ${act.isActive ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  boxShadow: act.isActive
                    ? '0 0 0 3px rgba(15, 76, 92, 0.22), 0 4px 14px rgba(15, 76, 92, 0.38)'
                    : '0 3px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  cursor: act.disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition:
                    'all 0.22s cubic-bezier(0.23, 1, 0.32, 1), background 0.18s ease, border-color 0.18s ease',
                  animation: act.isActive ? 'activePopPulse 0.32s cubic-bezier(0.34, 1.45, 0.64, 1)' : 'none',
                  outline: 'none',
                  flexShrink: 0,
                }}
              >
                {act.icon}
              </button>
            </div>
          );
        })}

        {/* Main Circular Trigger Button (Plus icon rotating 45deg into an 'x') */}
        <button
          type="button"
          data-testid="speed-dial-trigger"
          onClick={toggleDial}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close route actions menu' : 'Open route actions menu'}
          onMouseEnter={() => setIsTriggerHovered(true)}
          onMouseLeave={() => setIsTriggerHovered(false)}
          style={{
            position: 'absolute',
            left: isLeft ? 0 : 'auto',
            right: isLeft ? 'auto' : 0,
            bottom: 0,
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            overflow: 'hidden',
            clipPath: 'circle(50% at 50% 50%)',
            WebkitClipPath: 'circle(50% at 50% 50%)',
            background: 'var(--color-surface-card)',
            border: `1.5px solid ${isOpen || isTriggerHovered ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
            boxShadow: isOpen
              ? '0 0 0 3px rgba(15, 76, 92, 0.2), 0 6px 18px rgba(0, 0, 0, 0.16)'
              : isTriggerHovered
              ? '0 6px 18px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1)'
              : '0 4px 14px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.08)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isOpen || isTriggerHovered ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
            transform: isTriggerHovered ? 'scale(1.06)' : 'scale(1)',
            transformOrigin: 'center center',
            transition: 'transform 0.22s cubic-bezier(0.23, 1, 0.32, 1), border-color 0.18s ease, color 0.18s ease, box-shadow 0.22s ease',
            outline: 'none',
            pointerEvents: 'auto',
            zIndex: 1070,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            willChange: 'transform',
          }}
        >
          {/* Plus icon rotating 45deg seamlessly becomes an X */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
              transformOrigin: 'center center',
              transition: 'transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)',
              pointerEvents: 'none',
              userSelect: 'none',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              willChange: 'transform',
            }}
          >
            <PlusIcon size={18} color="currentColor" style={{ pointerEvents: 'none' }} />
          </div>
        </button>
      </div>
    </div>
  );
}
