import React from 'react';
import { IllustrationProps } from './types';

export function ReticleCompassIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      <circle cx="68" cy="34" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.85" />
      <circle cx="56" cy="44" r="16" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2.5" fill="none" />
      <line x1="68" y1="56" x2="80" y2="68" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="3" strokeLinecap="round" />
      <polygon points="56,33 58,44 56,42 54,44" fill="var(--color-accent-coral, #D42A2F)" />
      <polygon points="56,55 58,44 56,46 54,44" fill="var(--color-accent-teal-soft, #7CC4D1)" />
    </svg>
  );
}

export function TacticalRadarIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      <circle
        cx="60"
        cy="40"
        r="24"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
      />
      <circle cx="60" cy="40" r="14" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" fill="none" />
      <circle cx="60" cy="40" r="3" fill="var(--color-accent-gold, #E2B33C)" />
      <line
        x1="60"
        y1="40"
        x2="78"
        y2="24"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="78" cy="24" r="4.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <line x1="60" y1="12" x2="60" y2="16" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" />
      <line x1="60" y1="64" x2="60" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" />
      <line x1="32" y1="40" x2="36" y2="40" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" />
      <line x1="84" y1="40" x2="88" y2="40" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" />
      <line
        x1="20"
        y1="70"
        x2="100"
        y2="70"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export function ConstellationChartIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* Astrometric Framing Reticles */}
      <path d="M22 22 H18 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <path d="M98 22 H102 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />

      {/* Celestial Coordinate Orbital Ring */}
      <ellipse cx="60" cy="40" rx="38" ry="17" transform="rotate(-12 60 40)" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />

      {/* Star Constellation Lines (Cygnus / Astrometry Cross) */}
      <line x1="38" y1="44" x2="60" y2="35" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />
      <line x1="60" y1="35" x2="82" y2="28" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />
      <line x1="60" y1="20" x2="60" y2="35" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />
      <line x1="60" y1="35" x2="60" y2="52" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />

      {/* Constellation Star Nodes */}
      <circle cx="38" cy="44" r="3.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="60" cy="52" r="3" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="82" cy="28" r="3.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="60" cy="20" r="3" fill="var(--color-accent-teal-soft, #7CC4D1)" />

      {/* Golden Central Nexus Star (4-point sparkle) */}
      <circle cx="60" cy="35" r="4.5" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="60" y1="29" x2="60" y2="41" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.2" />
      <line x1="54" y1="35" x2="66" y2="35" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.2" />

      {/* Focal Coral Moon / Nebula Beacon */}
      <circle cx="84" cy="20" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* Horizon Degree Datum Line */}
      <line x1="20" y1="67" x2="100" y2="67" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="67" x2="40" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
      <line x1="60" y1="67" x2="60" y2="71" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="80" y1="67" x2="80" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
    </svg>
  );
}

export function BentoBoxLayoutIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      <rect
        x="30"
        y="22"
        width="60"
        height="40"
        rx="3"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="2"
        fill="none"
      />
      <line x1="60" y1="22" x2="60" y2="62" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="60" y1="42" x2="90" y2="42" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <polygon
        points="45,26 36,41 54,41"
        fill="var(--color-surface-card, #FAF6F0)"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.2"
      />
      <rect x="42" y="35" width="6" height="6" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <circle cx="45" cy="51" r="4.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <rect x="66" y="28" width="18" height="9" rx="2" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="66" y1="51" x2="73" y2="54" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <line x1="77" y1="49" x2="84" y2="52" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <line
        x1="20"
        y1="68"
        x2="100"
        y2="68"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
    </svg>
  );
}
