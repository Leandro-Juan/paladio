import React from 'react';
import { IllustrationProps } from './types';

export function FujiSilhouetteIllustration({
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
      <circle cx="60" cy="30" r="18" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path d="M24 70 L48 38 L54 44 L60 36 L66 44 L72 38 L96 70 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M48 38 L54 44 L60 36 L66 44 L72 38 L68 32 L52 32 Z" fill="var(--color-surface-card, #FAF6F0)" />
      <path
        d="M10 70 Q 30 66 50 70 T 90 70 T 110 70"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function ToriiGateIllustration({
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
      <path
        d="M30 32 C 45 28, 75 28, 90 32"
        stroke="var(--color-accent-coral, #D42A2F)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="36" y1="38" x2="84" y2="38" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2.5" />
      <line x1="44" y1="34" x2="42" y2="68" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="3" strokeLinecap="round" />
      <line x1="76" y1="34" x2="78" y2="68" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="50" r="10" fill="var(--color-accent-coral, #D42A2F)" opacity="0.85" />
      <line x1="20" y1="68" x2="100" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BonshoBellIllustration({
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
      <circle cx="76" cy="30" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.85" />
      <path
        d="M50 25 C50 25 55 24 60 24 C65 24 70 25 70 25 C70 32 68 46 72 54 L48 54 C52 46 50 32 50 25 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <rect x="46" y="54" width="28" height="4" rx="2" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <circle cx="60" cy="22" r="3" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" fill="none" />
      <circle cx="60" cy="44" r="3" fill="var(--color-accent-gold, #E2B33C)" />
      <path
        d="M32 64 C 45 61, 75 61, 88 64"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function PagodaWaypointIllustration({
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
      <circle cx="42" cy="32" r="12" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <line x1="70" y1="14" x2="70" y2="25" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="70" cy="18" r="2.5" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.2" fill="none" />
      <path d="M58 29 C64 27 76 27 82 29 L79 25 L61 25 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="65" y="29" width="10" height="5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M53 38 C61 35 79 35 87 38 L84 34 L56 34 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="63" y="38" width="14" height="6" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M48 49 C58 45 82 45 92 49 L89 44 L51 44 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="60" y="49" width="20" height="9" fill="var(--color-accent-teal-soft, #7CC4D1)" rx="1" />
      <line x1="28" y1="44" x2="28" y2="64" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <polygon points="28,44 37,48 28,52" fill="var(--color-accent-coral, #D42A2F)" />
      <line x1="18" y1="64" x2="102" y2="64" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function KitsuneMaskIllustration({
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
      <circle cx="60" cy="27" r="5.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path
        d="M44 32 L49 19 L56 28 L64 28 L71 19 L76 32 L72 52 L60 62 L48 52 Z"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <polygon points="48,27 51,22 54,28" fill="var(--color-accent-coral, #D42A2F)" opacity="0.8" />
      <polygon points="72,27 69,22 66,28" fill="var(--color-accent-coral, #D42A2F)" opacity="0.8" />
      <line x1="50" y1="41" x2="55" y2="43" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" strokeLinecap="round" />
      <line x1="70" y1="41" x2="65" y2="43" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" strokeLinecap="round" />
      <polygon points="58,52 62,52 60,55" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="36" y1="45" x2="42" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="84" y1="45" x2="78" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="22" y1="67" x2="98" y2="67" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}
