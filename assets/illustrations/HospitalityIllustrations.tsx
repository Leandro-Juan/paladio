import React from 'react';
import { IllustrationProps } from './types';

export function IzakayaLanternIllustration({
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
      <circle cx="82" cy="24" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <line x1="60" y1="12" x2="60" y2="22" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <rect x="52" y="22" width="16" height="3" rx="1" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path
        d="M52 25 C42 33 42 49 52 57 L68 57 C78 49 78 33 68 25 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <circle cx="60" cy="41" r="7" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="60" cy="41" r="3" fill="var(--color-accent-coral, #D42A2F)" />
      <line x1="47" y1="33" x2="73" y2="33" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <line x1="47" y1="49" x2="73" y2="49" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <rect x="54" y="57" width="12" height="3" rx="1" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <line x1="60" y1="60" x2="60" y2="67" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="2" strokeLinecap="round" />
      <line
        x1="22"
        y1="72"
        x2="98"
        y2="72"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export function TeaCeremonyIllustration({
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
      <circle cx="74" cy="24" r="6.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path
        d="M55 34 C53 28 57 22 55 16"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M63 34 C61 28 65 22 63 16"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M40 40 C40 54 50 61 60 61 C70 61 80 54 80 40 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <ellipse
        cx="60"
        cy="40"
        rx="20"
        ry="4"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        fill="var(--color-accent-teal-deep, #0F4C5C)"
      />
      <line x1="84" y1="50" x2="96" y2="60" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="18" y1="67" x2="102" y2="67" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BonsaiCraftIllustration({
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
      <circle cx="44" cy="28" r="11" fill="var(--color-accent-coral, #D42A2F)" opacity="0.88" />
      <path d="M42 56 L46 64 L74 64 L78 56 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="40" y1="56" x2="80" y2="56" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M60 56 Q 58 46 64 40 Q 68 36 66 30"
        stroke="var(--color-accent-teal-deep, #0F4C5C)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M64 40 Q 74 36 78 32"
        stroke="var(--color-accent-teal-deep, #0F4C5C)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M61 46 Q 50 42 46 38"
        stroke="var(--color-accent-teal-deep, #0F4C5C)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="66" cy="28" rx="9" ry="4" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <ellipse cx="80" cy="31" rx="7" ry="3.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <ellipse cx="44" cy="37" rx="8" ry="4" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="60" cy="56" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />
      <path d="M88 22 H92 V26" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="20" y1="69" x2="100" y2="69" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
