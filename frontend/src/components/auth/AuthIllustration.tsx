import React from 'react';

export function WaveAndSunIllustration() {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: '320px', height: 'auto', display: 'block' }}
      aria-hidden="true"
    >
      {/* Japanese Sun Disc Motif */}
      <circle cx="160" cy="85" r="44" fill="var(--color-accent-secondary, #D42A2F)" />
      {/* Stylized Ocean Wave Layer 1 */}
      <path
        d="M0 135 C60 115 100 155 160 135 C220 115 260 155 320 135 L320 200 L0 200 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
        opacity="0.5"
      />
      {/* Stylized Ocean Wave Layer 2 */}
      <path
        d="M0 152 C50 138 110 168 160 152 C210 138 270 168 320 152 L320 200 L0 200 Z"
        fill="var(--color-accent-primary, #0F4C5C)"
        opacity="0.85"
      />
      {/* Stylized Ocean Wave Layer 3 (Foreground Wave) */}
      <path
        d="M0 172 C70 158 90 182 160 172 C230 158 250 182 320 172 L320 200 L0 200 Z"
        fill="var(--color-bg-main, #F5EFEB)"
        opacity="0.3"
      />
    </svg>
  );
}

export function SunMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" fill="var(--color-accent-secondary, #D42A2F)" />
    </svg>
  );
}
