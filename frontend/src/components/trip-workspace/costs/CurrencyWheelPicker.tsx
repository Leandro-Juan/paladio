"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CurrencyInfo, SUPPORTED_CURRENCY_LIST } from '@/utils/currencyResolver';
import { FlagIcon } from './FlagIcon';

interface CurrencyWheelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCurrency: string;
  onSelectCurrency: (currency: CurrencyInfo) => void;
  title?: string;
}

const ITEM_HEIGHT = 44; // height of each item row in px
const VISIBLE_COUNT = 5; // number of visible items
const HALF_VISIBLE = Math.floor(VISIBLE_COUNT / 2);
const TICKS_PER_ITEM = 4;
const TICK_SPACING = ITEM_HEIGHT / TICKS_PER_ITEM; // 11px
const STAGE_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT; // 220px
const CENTER_Y = STAGE_HEIGHT / 2; // 110px

export function CurrencyWheelPicker({
  isOpen,
  onClose,
  selectedCurrency,
  onSelectCurrency,
  title = 'Select Currency',
}: CurrencyWheelPickerProps) {
  // Sort currencies alphabetically by country name
  const items = useMemo(() => {
    return [...SUPPORTED_CURRENCY_LIST].sort((a, b) => a.country.localeCompare(b.country));
  }, []);

  const initialIndex = useMemo(() => {
    const idx = items.findIndex((i) => i.code.toUpperCase() === selectedCurrency.toUpperCase());
    return idx >= 0 ? idx : 0;
  }, [items, selectedCurrency]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [continuousPos, setContinuousPos] = useState<number>(initialIndex);
  const [prevInitial, setPrevInitial] = useState(initialIndex);

  if (initialIndex !== prevInitial) {
    setPrevInitial(initialIndex);
    setSelectedIndex(initialIndex);
    setContinuousPos(initialIndex);
  }

  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const targetIndexRef = useRef(initialIndex);
  const dragStartYRef = useRef(0);
  const dragStartPosRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const spinRafRef = useRef<number | null>(null);

  // Sync target ref
  useEffect(() => {
    targetIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Cleanup ongoing animation on unmount
  useEffect(() => {
    return () => {
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
    };
  }, []);

  // 1. High-performance, physics-based spin animation using requestAnimationFrame
  const spinToIndex = useCallback(
    (targetIdx: number) => {
      const bounded = Math.max(0, Math.min(items.length - 1, targetIdx));
      targetIndexRef.current = bounded;
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);

      const startPos = continuousPos;
      const endPos = bounded;
      const delta = endPos - startPos;

      if (Math.abs(delta) < 0.005) {
        setContinuousPos(endPos);
        setSelectedIndex(endPos);
        return;
      }

      // Realistic duration scaling: faster for 1-2 steps, graceful spin for multi-item distance
      const duration = Math.min(850, Math.max(380, Math.abs(delta) * 50));
      const startTime = performance.now();

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Ease-out quartic (rapid spin initiation + smooth realistic braking deceleration)
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = startPos + delta * ease;

        setContinuousPos(current);
        setSelectedIndex(Math.round(current));

        if (progress < 1) {
          spinRafRef.current = requestAnimationFrame(animateStep);
        } else {
          setContinuousPos(endPos);
          setSelectedIndex(endPos);
          spinRafRef.current = null;
        }
      };

      spinRafRef.current = requestAnimationFrame(animateStep);
    },
    [continuousPos, items.length]
  );

  // 2. Smooth Animated Wheel Scrolling inside the spinner
  const onSpinnerWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const step = Math.sign(e.deltaY) || 1;
      const nextTarget = Math.max(0, Math.min(items.length - 1, targetIndexRef.current + step));
      targetIndexRef.current = nextTarget;
      spinToIndex(nextTarget);
    },
    [items.length, spinToIndex]
  );

  // 3. Complete Background Scroll Lock & Wheel Event Interception
  useEffect(() => {
    if (!isOpen) return;

    // Lock both document.body and document.documentElement
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';

    // Global non-passive wheel capturer on window (capture phase)
    const onGlobalWheel = (e: WheelEvent) => {
      // If event happened inside the spinner stage, forward to animated wheel handler
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        onSpinnerWheel(e);
        return;
      }
      // Outside the spinner stage: always prevent scrolling the page
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('wheel', onGlobalWheel, { passive: false, capture: true });

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      window.removeEventListener('wheel', onGlobalWheel, { capture: true });
    };
  }, [isOpen, onSpinnerWheel]);

  // 4. Search handler: spins smoothly from current position to matching country/currency
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const q = query.trim().toLowerCase();
    if (!q) return;

    const matchedIdx = items.findIndex(
      (item) =>
        item.country.toLowerCase().startsWith(q) ||
        item.code.toLowerCase().startsWith(q) ||
        item.country.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
    );

    if (matchedIdx >= 0) {
      spinToIndex(matchedIdx);
    }
  };

  // 5. Pointer Drag with instant direct tactile tracking
  const handlePointerDown = (e: React.PointerEvent) => {
    if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartPosRef.current = continuousPos;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartYRef.current;
    const newPos = Math.max(0, Math.min(items.length - 1, dragStartPosRef.current - deltaY / ITEM_HEIGHT));
    setContinuousPos(newPos);
    setSelectedIndex(Math.round(newPos));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const snapTarget = Math.round(continuousPos);
    spinToIndex(snapTarget);
  };

  // 6. Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        spinToIndex(Math.max(0, selectedIndex - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        spinToIndex(Math.min(items.length - 1, selectedIndex + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[selectedIndex] || items[0];
        if (item) {
          onSelectCurrency(item);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [isOpen, items, selectedIndex, onSelectCurrency, onClose, spinToIndex]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const currentItem = items[selectedIndex] || items[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
        overscrollBehavior: 'contain',
        touchAction: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Container Card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '380px',
          background: 'var(--color-surface-card, #FFFFFF)',
          color: 'var(--color-text-main, #1F2937)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))',
          padding: '22px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          userSelect: 'none',
          touchAction: 'none',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Close Button at top right */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.06))',
            border: 'none',
            color: 'var(--color-text-muted, #6B7280)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          className="hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={{ marginBottom: '12px', textAlign: 'center', width: '100%' }}>
          <h3
            style={{
              fontFamily: 'var(--font-display, "Jost", sans-serif)',
              fontSize: '1.15rem',
              fontWeight: 600,
              margin: 0,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.7rem',
              color: 'var(--color-text-muted, #6B7280)',
              marginTop: '4px',
            }}
          >
            Drag, scroll, or search to spin wheel
          </p>
        </div>

        {/* Compact Search Bar with animated spin on match */}
        <div
          style={{
            width: '100%',
            marginBottom: '14px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted, #9CA3AF)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search country or currency..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 32px 8px 34px',
              borderRadius: '10px',
              border: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.12))',
              background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.03))',
              color: 'var(--color-text-main, #1F2937)',
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '0.82rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted, #9CA3AF)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '11px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 3D Wheel Stage */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'relative',
            width: '100%',
            height: `${ITEM_HEIGHT * VISIBLE_COUNT}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Left Arrow Indicator (▶) centered vertically */}
          <div
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 5,
              width: '0',
              height: '0',
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderLeft: '7px solid var(--color-accent-teal, var(--color-accent-primary, #0F4C5C))',
            }}
          />

          {/* Curved Dial Tick Marks Arc along the left side (dynamically spins in sync with wheel) */}
          <svg
            style={{
              position: 'absolute',
              left: '14px',
              top: '0',
              width: '28px',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 2,
            }}
            viewBox="0 0 28 220"
            fill="none"
          >
            {(() => {
              const centerTick = continuousPos * TICKS_PER_ITEM;
              const minTick = Math.floor(centerTick - (CENTER_Y + 15) / TICK_SPACING);
              const maxTick = Math.ceil(centerTick + (CENTER_Y + 15) / TICK_SPACING);
              const ticks = [];

              for (let t = minTick; t <= maxTick; t++) {
                const y = CENTER_Y + (t - centerTick) * TICK_SPACING;
                const distFromCenter = Math.abs(y - CENTER_Y);
                if (distFromCenter > CENTER_Y + 12) continue;

                const xCurve = Math.pow(distFromCenter / CENTER_Y, 2) * 10;
                const x1 = 10 - xCurve;
                const tickType = ((t % TICKS_PER_ITEM) + TICKS_PER_ITEM) % TICKS_PER_ITEM;
                const isMajor = tickType === 0;
                const isMedium = tickType === 2;
                const isCenterActive = isMajor && distFromCenter < 5.5;

                const length = isCenterActive ? 9 : isMajor ? 8 : isMedium ? 5 : 3;
                const x2 = x1 + length;
                const opacity = Math.max(0.12, 1 - distFromCenter / (CENTER_Y + 10));

                ticks.push(
                  <line
                    key={t}
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke={
                      isCenterActive
                        ? 'var(--color-accent-teal, var(--color-accent-primary, #0F4C5C))'
                        : 'var(--color-text-muted, #9CA3AF)'
                    }
                    strokeWidth={isCenterActive ? '2.0' : isMajor ? '1.6' : '1.1'}
                    strokeLinecap="round"
                    opacity={opacity}
                  />
                );
              }
              return ticks;
            })()}
          </svg>

          {/* Center Active Pill Capsule (translucent highlight underneath items, starts at 46px) */}
          <div
            style={{
              position: 'absolute',
              left: '46px',
              right: '12px',
              height: `${ITEM_HEIGHT}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              borderRadius: '12px',
              background: 'rgba(15, 76, 92, 0.08)',
              zIndex: 1,
              pointerEvents: 'none',
              border: '1.5px solid rgba(15, 76, 92, 0.22)',
              boxShadow: '0 2px 8px rgba(15, 76, 92, 0.06)',
            }}
          />

          {/* Wheel Items with 3D Perspective and Opacity (starts at 58px for 12px internal breathing room) */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              perspective: '600px',
              zIndex: 3,
            }}
          >
            {items.map((item, idx) => {
              const distance = idx - continuousPos;
              const absDist = Math.abs(distance);

              // Render visible items + buffer
              if (absDist > HALF_VISIBLE + 1.6) return null;

              const yOffset = distance * ITEM_HEIGHT;
              const rotateAngle = distance * 18; // 3D cylinder rotation
              const scale = Math.max(0.85, 1 - absDist * 0.05);
              const opacity = Math.max(0.2, 1 - absDist * 0.35);
              const isCenter = absDist < 0.45;

              return (
                <div
                  key={item.code + item.country}
                  onClick={() => {
                    spinToIndex(idx);
                  }}
                  style={{
                    position: 'absolute',
                    left: '58px',
                    right: '16px',
                    height: `${ITEM_HEIGHT}px`,
                    top: `calc(50% - ${ITEM_HEIGHT / 2}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    zIndex: isCenter ? 6 : 4,
                    transform: `translateY(${yOffset}px) rotateX(${-rotateAngle}deg) scale(${scale})`,
                    transformOrigin: 'center center',
                    opacity,
                    transition: isDragging ? 'none' : 'opacity 0.15s ease',
                  }}
                >
                  <FlagIcon countryCode={item.countryCode} width={24} height={16} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-display, "Jost", sans-serif)',
                        fontWeight: isCenter ? 650 : 500,
                        fontSize: isCenter ? '0.98rem' : '0.9rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isCenter
                          ? 'var(--color-text-primary, var(--color-text-main, #111827))'
                          : 'var(--color-text-muted, #6B7280)',
                      }}
                    >
                      {item.country}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.74rem',
                        fontWeight: isCenter ? 600 : 400,
                        color: isCenter ? 'var(--color-accent-teal-deep, #0F4C5C)' : 'var(--color-text-muted, #9CA3AF)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {item.code} ({item.symbol})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={() => {
            onSelectCurrency(currentItem);
            onClose();
          }}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '12px 18px',
            borderRadius: '12px',
            border: 'none',
            background: 'var(--color-accent-primary, #0F4C5C)',
            color: 'var(--color-text-on-accent, #FFFFFF)',
            fontFamily: 'var(--font-display, "Jost", sans-serif)',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(15, 76, 92, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.15s ease',
          }}
          className="hover:opacity-95 active:scale-[0.98]"
        >
          <FlagIcon countryCode={currentItem.countryCode} width={20} height={14} />
          <span>
            Use {currentItem.country} — {currentItem.code} ({currentItem.symbol})
          </span>
        </button>
      </div>
    </div>
  );
}
