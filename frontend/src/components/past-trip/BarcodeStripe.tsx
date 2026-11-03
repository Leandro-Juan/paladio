"use client";

import React, { useMemo } from 'react';

interface BarcodeStripeProps {
  value: string;
  height?: number;
  width?: string | number;
  className?: string;
  showText?: boolean;
}

/**
 * Deterministic tactical barcode generator.
 * Converts any alphanumeric string into an authentic pattern of bars
 * for the boarding pass card in the Pacific Jazz / Japanese Tactical design system.
 */
export function BarcodeStripe({
  value,
  height = 36,
  width = '100%',
  className = '',
  showText = true,
}: BarcodeStripeProps) {
  const bars = useMemo(() => {
    const text = value || 'PLD-PASS-000';
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }

    const pattern: Array<{ width: number; isBar: boolean }> = [];
    let currentSeed = seed;
    const rng = () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
      return currentSeed / 4294967296;
    };

    // Start sentinel
    pattern.push({ width: 2, isBar: true });
    pattern.push({ width: 1, isBar: false });
    pattern.push({ width: 2, isBar: true });
    pattern.push({ width: 1, isBar: false });

    // Payload bars
    const count = 38;
    for (let i = 0; i < count; i++) {
      const barWidth = Math.floor(rng() * 3) + 1;
      const gapWidth = Math.floor(rng() * 2) + 1;
      pattern.push({ width: barWidth, isBar: true });
      pattern.push({ width: gapWidth, isBar: false });
    }

    // Stop sentinel
    pattern.push({ width: 2, isBar: true });
    pattern.push({ width: 1, isBar: false });
    pattern.push({ width: 2, isBar: true });

    return pattern;
  }, [value]);

  const totalWidth = useMemo(() => {
    return bars.reduce((sum, b) => sum + b.width, 0);
  }, [bars]);

  let currentX = 0;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: typeof width === 'number' ? `${width}px` : width,
        userSelect: 'none',
      }}
    >
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        style={{
          width: '100%',
          height: `${height}px`,
          shapeRendering: 'crispEdges',
          display: 'block',
        }}
        aria-hidden="true"
      >
        {bars.map((bar, idx) => {
          const x = currentX;
          currentX += bar.width;
          if (!bar.isBar) return null;
          return (
            <rect
              key={idx}
              x={x}
              y={0}
              width={bar.width}
              height={height}
              fill="var(--color-text-primary, #1A2B32)"
            />
          );
        })}
      </svg>
      {showText && (
        <span
          className="font-mono"
          style={{
            fontSize: '0.625rem',
            letterSpacing: '0.14em',
            color: 'var(--color-text-muted, #566B76)',
            marginTop: '4px',
            textTransform: 'uppercase',
          }}
        >
          {value || 'PALADIO-MISSION-VAULT'}
        </span>
      )}
    </div>
  );
}
