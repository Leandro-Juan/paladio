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

export function BoardingPassTacticalIllustration({
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
      {/* Layer 1: Celestial Anchor / Departure Sun Seal */}
      <circle cx="88" cy="22" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.95" />
      <circle cx="88" cy="22" r="2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Layer 2: Primary Boarding Pass Silhouette with Symmetrical Tear Notches */}
      <path
        d="M20 18 H98 C100.2 18 102 19.8 102 22 V36 C98.5 36 96 37.8 96 40 C96 42.2 98.5 44 102 44 V58 C102 60.2 100.2 62 98 62 H20 C17.8 62 16 60.2 16 58 V44 C19.5 44 22 42.2 22 40 C22 37.8 19.5 36 16 36 V22 C16 19.8 17.8 18 20 18 Z"
        fill="var(--color-surface-card, #FAF6F0)"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
      />

      {/* Perforated Boarding Stub Divider */}
      <line x1="76" y1="19" x2="76" y2="61" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeDasharray="3 2" />

      {/* Aerodynamic Jet Silhouette with Origami Facets */}
      <path
        d="M62 38 L47 33 L32 36 L30 38 L32 40 L47 43 Z"
        fill="var(--color-accent-teal-deep, #0F4C5C)"
      />
      <path
        d="M48 33 L38 24 L42 24 L54 35 Z"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <path
        d="M48 43 L38 52 L42 52 L54 41 Z"
        fill="var(--color-accent-teal-soft, #7CC4D1)"
      />
      <path
        d="M34 36 L31 30 L33 30 L37 37 Z"
        fill="var(--color-accent-gold, #E2B33C)"
      />

      {/* Flight Telemetry Trajectory Line */}
      <path
        d="M25 48 C36 51 47 49 63 44"
        stroke="var(--color-accent-teal-soft, #7CC4D1)"
        strokeWidth="1.2"
        strokeDasharray="2 2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="25" cy="48" r="1.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="63" cy="44" r="1.5" fill="var(--color-accent-coral, #D42A2F)" />

      {/* Layer 3: Tactical Barcode Telemetry & Viewfinder Brackets */}
      <line x1="82" y1="30" x2="82" y2="52" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />
      <line x1="85" y1="30" x2="85" y2="52" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1" />
      <line x1="88" y1="30" x2="88" y2="52" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2.5" />
      <line x1="92" y1="30" x2="92" y2="52" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1" />
      <line x1="95" y1="30" x2="95" y2="52" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />

      {/* Tactical Crop Brackets */}
      <path d="M26 23 H22 V27" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M70 23 H74 V27" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M22 53 V57 H26" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* Layer 4: Grounding Runway Baseline */}
      <line x1="14" y1="70" x2="106" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="70" x2="54" y2="70" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="2" strokeLinecap="round" />
      <line x1="68" y1="70" x2="78" y2="70" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HotelBookingTacticalIllustration({
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
      {/* Layer 1: Evening Celestial Moon Disc */}
      <circle cx="88" cy="22" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.95" />
      <circle cx="88" cy="22" r="2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Layer 2: Hotel Reservation Voucher Silhouette */}
      <path
        d="M20 18 H98 C100.2 18 102 19.8 102 22 V36 C98.5 36 96 37.8 96 40 C96 42.2 98.5 44 102 44 V58 C102 60.2 100.2 62 98 62 H20 C17.8 62 16 60.2 16 58 V44 C19.5 44 22 42.2 22 40 C22 37.8 19.5 36 16 36 V22 C16 19.8 17.8 18 20 18 Z"
        fill="var(--color-surface-card, #FAF6F0)"
        stroke="var(--color-border, #E2D9CC)"
        strokeWidth="1.5"
      />

      {/* Perforated Stub Divider */}
      <line x1="76" y1="19" x2="76" y2="61" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeDasharray="3 2" />

      {/* Hotel Architectural Facade */}
      <rect x="29" y="27" width="22" height="29" rx="2" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M27 27 L40 21 L53 27 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* Illuminated Gold Windows Matrix */}
      <rect x="33" y="30" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="38" y="30" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="44" y="30" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />

      <rect x="33" y="36" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="38" y="36" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="44" y="36" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />

      <rect x="33" y="42" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="38" y="42" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="44" y="42" width="3" height="3" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Hotel Portal / Entry Canopy */}
      <rect x="37" y="48" width="6" height="8" fill="var(--color-accent-teal-soft, #7CC4D1)" />

      {/* Room Access Keycard Silhouette on Right Stub */}
      <rect x="81" y="32" width="15" height="22" rx="2" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="84" y="35" width="4" height="4" rx="0.8" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="81" y1="46" x2="96" y2="46" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />
      <circle cx="89" cy="50" r="1" fill="var(--color-accent-teal-soft, #7CC4D1)" />

      {/* Layer 3: Tactical Crop Brackets */}
      <path d="M26 23 H22 V27" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M70 23 H74 V27" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M22 53 V57 H26" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* Layer 4: Grounding Baseline */}
      <line x1="14" y1="70" x2="106" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="36" y1="70" x2="50" y2="70" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2" strokeLinecap="round" />
      <line x1="78" y1="70" x2="90" y2="70" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}


