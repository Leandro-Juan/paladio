import React from 'react';
import { IllustrationProps } from './types';

export function FlightTakeoffIllustration({
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
      <circle cx="82" cy="24" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <path
        d="M24 64 C 42 62, 64 48, 86 32"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
      />
      <path
        d="M60 42 L74 32 L82 31 L80 34 L72 40 L84 46 L82 48 L70 44 L60 49 L58 48 L61 44 L56 43 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <circle cx="56" cy="45" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="20" y1="66" x2="52" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="71" x2="46" y2="71" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="16" y1="66" x2="104" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" strokeDasharray="4 4" />
    </svg>
  );
}

export function HotelLodgingIllustration({
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
      <circle cx="78" cy="24" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <rect x="42" y="28" width="36" height="38" rx="2" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M38 28 L60 20 L82 28 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="48" y="34" width="6" height="6" rx="1" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="58" y="34" width="6" height="6" rx="1" fill="var(--color-surface-card, #FAF6F0)" />
      <rect x="66" y="34" width="6" height="6" rx="1" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <rect x="48" y="44" width="6" height="6" rx="1" fill="var(--color-surface-card, #FAF6F0)" />
      <rect x="58" y="44" width="6" height="6" rx="1" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="66" y="44" width="6" height="6" rx="1" fill="var(--color-surface-card, #FAF6F0)" />
      <rect x="55" y="56" width="10" height="10" rx="1" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <line x1="20" y1="66" x2="100" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function WalletLedgerIllustration({
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
      <circle cx="82" cy="28" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <rect
        x="32"
        y="25"
        width="46"
        height="30"
        rx="3"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <rect x="38" y="34" width="46" height="30" rx="4" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <line x1="38" y1="42" x2="84" y2="42" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="3" />
      <circle cx="48" cy="52" r="4.5" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="70" cy="52" r="3.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="22" y1="68" x2="98" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CollaboratorNetworkIllustration({
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
      <circle cx="60" cy="30" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <circle cx="36" cy="46" r="6" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="84" cy="46" r="6" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="60" cy="50" r="3.5" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="60" y1="30" x2="36" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" />
      <line x1="60" y1="30" x2="84" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" />
      <line
        x1="36"
        y1="46"
        x2="84"
        y2="46"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <path
        d="M48 20 C 56 16, 64 16, 72 20"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="22" y1="66" x2="98" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RouteSolverOptimizationIllustration({
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
      <circle cx="40" cy="28" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <circle cx="78" cy="26" r="5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="86" cy="50" r="5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="48" cy="56" r="5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="28" cy="46" r="4.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <circle cx="62" cy="40" r="3.5" fill="var(--color-accent-gold, #E2B33C)" />
      <path
        d="M40 28 L78 26 L86 50 L48 56 L28 46 Z"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="58" y1="36" x2="66" y2="44" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.5" />
      <line x1="66" y1="36" x2="58" y2="44" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.5" />
      <path d="M22 22 H18 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <path d="M98 22 H102 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="18" y1="68" x2="102" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

export function OfflineMapTopoIllustration({
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
      <circle cx="60" cy="24" r="5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <polygon points="57,27 63,27 60,34" fill="var(--color-accent-coral, #D42A2F)" />
      <polygon
        points="30,34 50,30 70,34 90,30 90,62 70,66 50,62 30,66"
        fill="none"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line x1="50" y1="30" x2="50" y2="62" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="70" y1="34" x2="70" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <path d="M36 50 C 42 44, 46 54, 48 48" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" fill="none" />
      <path d="M54 48 C 60 42, 64 52, 68 44" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.2" fill="none" />
      <path d="M74 48 C 78 44, 82 52, 86 46" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" fill="none" />
      <line x1="20" y1="70" x2="100" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TimelineScheduleIllustration({
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
      <circle cx="80" cy="26" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <line x1="32" y1="44" x2="88" y2="44" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="44" r="4.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <line x1="40" y1="36" x2="40" y2="44" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />
      <rect x="35" y="28" width="10" height="7" rx="1.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <circle cx="60" cy="44" r="5.5" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="60" y1="44" x2="60" y2="56" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.5" />
      <rect x="52" y="56" width="16" height="8" rx="2" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <circle cx="80" cy="44" r="4.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <line x1="40" y1="67" x2="80" y2="67" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="20" y1="70" x2="100" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function WeatherForecastIllustration({
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
      {/* Radiant Coral Sun Disc */}
      <circle cx="72" cy="28" r="14" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* Gold Sunbeam Flare Ring */}
      <line x1="84" y1="16" x2="90" y2="10" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />
      <line x1="91" y1="28" x2="98" y2="28" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />

      {/* Japanese Floating Wind Curl (Kumo mist ribbon) */}
      <path d="M22 34 H42 C46 34 49 31 49 28 C49 25 46 25 43 25" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" fill="none" />

      {/* Traditional Stylized Cloud Silhouette */}
      <path
        d="M30 52 C30 46 36 44 40 46 C43 38 54 36 60 42 C64 38 74 38 78 44 C84 44 88 47 88 52 L30 52 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />

      {/* Cloud Base Structural Underlay */}
      <rect x="28" y="52" width="62" height="3" rx="1.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* Tactically Spaced Diagonal Rain Vectors */}
      <line x1="38" y1="58" x2="34" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="48" y1="58" x2="44" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="58" y1="58" x2="54" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="68" y1="58" x2="64" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="78" y1="58" x2="74" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" strokeLinecap="round" />

      {/* Horizon Ground Platform */}
      <line x1="18" y1="70" x2="102" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function NetworkErrorIllustration({
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
      {/* Alert Warning Disc */}
      <circle cx="82" cy="24" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.95" />
      <line x1="82" y1="20" x2="82" y2="24" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="82" cy="27" r="0.8" fill="#FFFFFF" />

      {/* Transmission Antenna Mast */}
      <line x1="45" y1="18" x2="45" y2="66" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2" strokeLinecap="round" />
      {/* Mast Spire Beacon */}
      <circle cx="45" cy="18" r="3" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Cross-spars */}
      <line x1="37" y1="32" x2="53" y2="32" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" />
      <line x1="33" y1="46" x2="57" y2="46" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" />
      {/* Diagonal Truss Bracing */}
      <line x1="37" y1="32" x2="45" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <line x1="53" y1="32" x2="45" y2="46" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <line x1="33" y1="46" x2="45" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <line x1="57" y1="46" x2="45" y2="66" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />

      {/* Intact Radio Waves (Left) */}
      <path d="M37 20 C31 24, 31 34, 37 38" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M31 15 C22 21, 22 39, 31 45" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />

      {/* Severed Fragmented Waves (Right) */}
      <path d="M53 20 C57 23, 58 26, 58 29" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
      <path d="M59 15 C66 20, 68 25, 66 31" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" opacity="0.6" />

      {/* Lightning Fracture Disconnect */}
      <path d="M68 33 L63 41 L71 41 L66 51" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Grounding Baseline with Telemetry Ticks */}
      <line x1="18" y1="66" x2="102" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="66" x2="26" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="94" y1="66" x2="94" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
    </svg>
  );
}

export function PageNotFoundIllustration({
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
      <circle cx="78" cy="24" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <line x1="60" y1="28" x2="60" y2="66" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2.5" />
      <path d="M60 32 L36 32 L30 36 L36 40 L60 40 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M60 43 L84 43 L90 47 L84 51 L60 51 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <circle cx="44" cy="36" r="1.5" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="76" cy="47" r="1.5" fill="var(--color-accent-gold, #E2B33C)" />
      <path d="M22 22 H18 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <path d="M98 22 H102 V26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <path
        d="M16 66 Q 40 62 60 66 T 104 66"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function VaultSecurityIllustration({
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
      <circle cx="80" cy="25" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <circle
        cx="58"
        cy="42"
        r="22"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="2.5"
        fill="none"
      />
      <circle cx="58" cy="42" r="13" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" fill="none" />
      <line x1="58" y1="29" x2="58" y2="33" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" />
      <line x1="58" y1="51" x2="58" y2="55" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" />
      <line x1="45" y1="42" x2="49" y2="42" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" />
      <line x1="67" y1="42" x2="71" y2="42" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="2" />
      <circle cx="58" cy="42" r="4.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="57" y="42" width="2" height="5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M30 22 H24 V28" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <path d="M86 22 H92 V28" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="20" y1="69" x2="98" y2="69" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TelemetryAnalyticsIllustration({
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
      <circle cx="82" cy="22" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <rect x="34" y="46" width="9" height="18" rx="1.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <rect x="48" y="36" width="9" height="28" rx="1.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="62" y="26" width="9" height="38" rx="1.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect
        x="76"
        y="32"
        width="9"
        height="32"
        rx="1.5"
        stroke="var(--color-accent-gold, #E2B33C)"
        strokeWidth="1.5"
        strokeDasharray="3 2"
        fill="none"
      />
      <path
        d="M26 50 Q 42 40 56 42 T 88 24"
        stroke="var(--color-accent-gold, #E2B33C)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="22" y1="66" x2="98" y2="66" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
