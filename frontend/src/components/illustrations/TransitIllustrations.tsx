import React from 'react';
import { IllustrationProps } from './types';

export function OrigamiTicketIllustration({
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
      {/* Perforated Boarding Pass Card Outline with Notches */}
      <path
        d="M20 22 C20 20 22 18 24 18 H96 C98 18 100 20 100 22 V36 C97 36 95 38 95 41 C95 44 97 46 100 46 V60 C100 62 98 64 96 64 H24 C22 64 20 62 20 60 V46 C23 46 25 44 25 41 C25 38 23 36 20 36 Z"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Perforated Stub Divider */}
      <line x1="74" y1="18" x2="74" y2="64" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeDasharray="3 2" />

      {/* Origami Crane (Orizuru) Silhouette */}
      <polygon points="45,46 32,26 54,36" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="45,46 54,36 62,28 52,48" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <path d="M45 46 L38 38 L30 36 L34 40 L41 47 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="52,48 58,45 50,56" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.8" />

      {/* Red Hanko Stamp Seal on Stub */}
      <rect x="80" y="26" width="14" height="14" rx="2" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.5" fill="none" />
      <circle cx="87" cy="33" r="3.5" fill="var(--color-accent-coral, #D42A2F)" />
      <circle cx="87" cy="33" r="1.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Barcode Telemetry Lines */}
      <line x1="79" y1="48" x2="79" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="82" y1="48" x2="82" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
      <line x1="85" y1="48" x2="85" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" />
      <line x1="89" y1="48" x2="89" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
      <line x1="92" y1="48" x2="92" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
    </svg>
  );
}

export function ViewfinderPhotoIllustration({
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
      <path d="M35 30 H28 V37" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <path d="M85 30 H92 V37" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 53 V60 H35" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <path d="M92 53 V60 H85" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="70" cy="40" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path d="M40 58 L54 44 L62 52 L68 46 L78 58 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
    </svg>
  );
}

export function ShinkansenTrainIllustration({
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
      <circle cx="86" cy="34" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path
        d="M22 55 L52 55 L68 45 L86 45 C92 45 97 49 98 55 L22 55 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <path d="M68 46 L78 46 L74 50 L64 50 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="30" y1="52" x2="60" y2="52" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.5" />
      <line
        x1="12"
        y1="45"
        x2="32"
        y2="45"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line
        x1="16"
        y1="40"
        x2="28"
        y2="40"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
      <line x1="14" y1="58" x2="106" y2="58" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" strokeLinecap="round" />
      <line
        x1="18"
        y1="62"
        x2="102"
        y2="62"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

export function OrigamiBoatIllustration({
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
      <circle cx="78" cy="28" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <polygon points="34,55 45,64 75,64 86,55" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="56,32 60,32 60,55 48,55" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <polygon points="60,32 70,55 60,55" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <circle cx="60" cy="30" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />
      <path
        d="M16 67 Q 30 64 44 67 T 72 67 T 100 67"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M26 72 Q 40 69 54 72 T 82 72 T 96 72"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
