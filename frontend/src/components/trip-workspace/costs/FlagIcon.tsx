import React from 'react';

interface FlagIconProps {
  countryCode: string;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Helper to generate a 5-pointed star polygon
function createStarPoints(cx: number, cy: number, rOuter: number, rInner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * 36 - 90) * (Math.PI / 180);
    const r = i % 2 === 0 ? rOuter : rInner;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(' ');
}

const svgStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};

/**
 * High-fidelity, zero-dependency SVG vector flags for all supported Paladio countries.
 * Rendered with display: block and pixel-perfect vector geometry to prevent baseline shift
 * or clipping artifacts across all modern browsers.
 */
export function FlagIcon({
  countryCode,
  size,
  width = size ? size : 24,
  height = size ? Math.round(size * 0.67) : 16,
  className,
  style,
}: FlagIconProps) {
  const code = (countryCode || '').toUpperCase().trim();

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: '2px',
    overflow: 'hidden',
    flexShrink: 0,
    verticalAlign: 'middle',
    lineHeight: 0,
    background: 'transparent',
    ...style,
  };

  switch (code) {
    case 'EU': // European Union: 12 crisp 5-point yellow stars on blue field
      return (
        <span style={containerStyle} className={className} title="European Union">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#003399" />
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const cx = 320 + Math.sin(angle) * 125;
              const cy = 240 - Math.cos(angle) * 125;
              return <polygon key={i} points={createStarPoints(cx, cy, 18, 7.5)} fill="#FFCC00" />;
            })}
          </svg>
        </span>
      );

    case 'ES': // Spain: Red, gold, red with royal crown crest
      return (
        <span style={containerStyle} className={className} title="Spain">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="120" fill="#AA151B" />
            <rect y="120" width="640" height="240" fill="#F1BF00" />
            <rect y="360" width="640" height="120" fill="#AA151B" />
            {/* Stylized coat of arms */}
            <rect x="160" y="195" width="56" height="70" rx="10" fill="#AA151B" />
            <rect x="168" y="203" width="40" height="54" fill="#F1BF00" />
            <path d="M160 185 Q188 170 216 185 Z" fill="#D42A2F" />
            <circle cx="188" cy="176" r="6" fill="#F1BF00" />
            <rect x="142" y="190" width="8" height="80" rx="3" fill="#D4AF37" />
            <rect x="226" y="190" width="8" height="80" rx="3" fill="#D4AF37" />
          </svg>
        </span>
      );

    case 'US': // United States: 13 stripes + blue canton with star grid
      return (
        <span style={containerStyle} className={className} title="United States">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#B22234" />
            {Array.from({ length: 6 }).map((_, i) => (
              <rect key={i} y={37 * (2 * i + 1)} width="640" height="37" fill="#FFFFFF" />
            ))}
            <rect width="260" height="260" fill="#3C3B6E" />
            {/* 4x3 Star grid */}
            {[0, 1, 2].map((row) =>
              [0, 1, 2, 3].map((col) => (
                <polygon
                  key={`${row}-${col}`}
                  points={createStarPoints(38 + col * 60, 42 + row * 65, 12, 5)}
                  fill="#FFFFFF"
                />
              ))
            )}
          </svg>
        </span>
      );

    case 'GB': // United Kingdom: Union Jack
    case 'UK':
      return (
        <span style={containerStyle} className={className} title="United Kingdom">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#012169" />
            <path d="M0 0l640 480M640 0L0 480" stroke="#FFFFFF" strokeWidth="80" />
            <path d="M0 0l640 480M640 0L0 480" stroke="#C8102E" strokeWidth="36" />
            <path d="M0 240h640M320 0v480" stroke="#FFFFFF" strokeWidth="120" />
            <path d="M0 240h640M320 0v480" stroke="#C8102E" strokeWidth="72" />
          </svg>
        </span>
      );

    case 'JP': // Japan: White field with crimson sun disc
      return (
        <span style={containerStyle} className={className} title="Japan">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#FFFFFF" />
            <circle cx="320" cy="240" r="144" fill="#BC002D" />
          </svg>
        </span>
      );

    case 'FR': // France
      return (
        <span style={containerStyle} className={className} title="France">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="213" height="480" fill="#002654" />
            <rect x="213" width="214" height="480" fill="#FFFFFF" />
            <rect x="427" width="213" height="480" fill="#CE1126" />
          </svg>
        </span>
      );

    case 'DE': // Germany
      return (
        <span style={containerStyle} className={className} title="Germany">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="160" fill="#000000" />
            <rect y="160" width="640" height="160" fill="#DD0000" />
            <rect y="320" width="640" height="160" fill="#FFCE00" />
          </svg>
        </span>
      );

    case 'IT': // Italy
      return (
        <span style={containerStyle} className={className} title="Italy">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="213" height="480" fill="#009246" />
            <rect x="213" width="214" height="480" fill="#FFFFFF" />
            <rect x="427" width="213" height="480" fill="#CE2B37" />
          </svg>
        </span>
      );

    case 'PL': // Poland
      return (
        <span style={containerStyle} className={className} title="Poland">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="240" fill="#FFFFFF" />
            <rect y="240" width="640" height="240" fill="#DC143C" />
          </svg>
        </span>
      );

    case 'CH': // Switzerland
      return (
        <span style={containerStyle} className={className} title="Switzerland">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#D52B1E" />
            <rect x="270" y="110" width="100" height="260" rx="4" fill="#FFFFFF" />
            <rect x="190" y="190" width="260" height="100" rx="4" fill="#FFFFFF" />
          </svg>
        </span>
      );

    case 'NO': // Norway
      return (
        <span style={containerStyle} className={className} title="Norway">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#BA0C2F" />
            <path d="M0 240h640M200 0v480" stroke="#FFFFFF" strokeWidth="80" />
            <path d="M0 240h640M200 0v480" stroke="#00205B" strokeWidth="40" />
          </svg>
        </span>
      );

    case 'SE': // Sweden
      return (
        <span style={containerStyle} className={className} title="Sweden">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#006AA7" />
            <path d="M0 240h640M220 0v480" stroke="#FECC00" strokeWidth="60" />
          </svg>
        </span>
      );

    case 'DK': // Denmark
      return (
        <span style={containerStyle} className={className} title="Denmark">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#C60C30" />
            <path d="M0 240h640M200 0v480" stroke="#FFFFFF" strokeWidth="60" />
          </svg>
        </span>
      );

    case 'CA': // Canada
      return (
        <span style={containerStyle} className={className} title="Canada">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="160" height="480" fill="#FF0000" />
            <rect x="160" width="320" height="480" fill="#FFFFFF" />
            <rect x="480" width="160" height="480" fill="#FF0000" />
            {/* Maple Leaf */}
            <polygon
              points="320,120 335,170 375,155 355,195 390,210 365,235 375,255 330,245 325,290 315,290 310,245 265,255 275,235 250,210 285,195 265,155 305,170"
              fill="#FF0000"
            />
          </svg>
        </span>
      );

    case 'AU': // Australia
      return (
        <span style={containerStyle} className={className} title="Australia">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#00008B" />
            {/* Mini Union Jack canton */}
            <g transform="scale(0.5)">
              <rect width="640" height="480" fill="#012169" />
              <path d="M0 0l640 480M640 0L0 480" stroke="#FFFFFF" strokeWidth="60" />
              <path d="M0 0l640 480M640 0L0 480" stroke="#C8102E" strokeWidth="20" />
              <path d="M0 240h640M320 0v480" stroke="#FFFFFF" strokeWidth="100" />
              <path d="M0 240h640M320 0v480" stroke="#C8102E" strokeWidth="60" />
            </g>
            {/* Commonwealth Star */}
            <polygon points={createStarPoints(160, 360, 36, 16)} fill="#FFFFFF" />
            {/* Southern Cross */}
            <polygon points={createStarPoints(480, 140, 16, 7)} fill="#FFFFFF" />
            <polygon points={createStarPoints(540, 200, 16, 7)} fill="#FFFFFF" />
            <polygon points={createStarPoints(480, 320, 16, 7)} fill="#FFFFFF" />
            <polygon points={createStarPoints(420, 220, 16, 7)} fill="#FFFFFF" />
            <polygon points={createStarPoints(510, 260, 10, 4)} fill="#FFFFFF" />
          </svg>
        </span>
      );

    case 'NZ': // New Zealand
      return (
        <span style={containerStyle} className={className} title="New Zealand">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#00247D" />
            <g transform="scale(0.5)">
              <rect width="640" height="480" fill="#012169" />
              <path d="M0 0l640 480M640 0L0 480" stroke="#FFFFFF" strokeWidth="60" />
              <path d="M0 0l640 480M640 0L0 480" stroke="#C8102E" strokeWidth="20" />
              <path d="M0 240h640M320 0v480" stroke="#FFFFFF" strokeWidth="100" />
              <path d="M0 240h640M320 0v480" stroke="#C8102E" strokeWidth="60" />
            </g>
            <polygon points={createStarPoints(480, 140, 18, 8)} fill="#CC142B" stroke="#FFFFFF" strokeWidth="3" />
            <polygon points={createStarPoints(540, 200, 18, 8)} fill="#CC142B" stroke="#FFFFFF" strokeWidth="3" />
            <polygon points={createStarPoints(480, 320, 20, 9)} fill="#CC142B" stroke="#FFFFFF" strokeWidth="3" />
            <polygon points={createStarPoints(420, 220, 18, 8)} fill="#CC142B" stroke="#FFFFFF" strokeWidth="3" />
          </svg>
        </span>
      );

    case 'CN': // China
      return (
        <span style={containerStyle} className={className} title="China">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#EE1C25" />
            <polygon points={createStarPoints(120, 120, 45, 18)} fill="#FFFF00" />
            <polygon points={createStarPoints(220, 60, 15, 6)} fill="#FFFF00" />
            <polygon points={createStarPoints(260, 110, 15, 6)} fill="#FFFF00" />
            <polygon points={createStarPoints(260, 175, 15, 6)} fill="#FFFF00" />
            <polygon points={createStarPoints(220, 225, 15, 6)} fill="#FFFF00" />
          </svg>
        </span>
      );

    case 'IN': // India
      return (
        <span style={containerStyle} className={className} title="India">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="160" fill="#FF9933" />
            <rect y="160" width="640" height="160" fill="#FFFFFF" />
            <rect y="320" width="640" height="160" fill="#138808" />
            {/* Ashoka Chakra */}
            <circle cx="320" cy="240" r="50" fill="none" stroke="#000080" strokeWidth="6" />
            <circle cx="320" cy="240" r="10" fill="#000080" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={i}
                x1={320 + Math.sin((i * 30 * Math.PI) / 180) * 10}
                y1={240 - Math.cos((i * 30 * Math.PI) / 180) * 10}
                x2={320 + Math.sin((i * 30 * Math.PI) / 180) * 50}
                y2={240 - Math.cos((i * 30 * Math.PI) / 180) * 50}
                stroke="#000080"
                strokeWidth="3"
              />
            ))}
          </svg>
        </span>
      );

    case 'BR': // Brazil
      return (
        <span style={containerStyle} className={className} title="Brazil">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#009B3A" />
            <polygon points="320,60 580,240 320,420 60,240" fill="#FEDF00" />
            <circle cx="320" cy="240" r="95" fill="#002776" />
            <path d="M228 250 Q320 200 412 250" stroke="#FFFFFF" strokeWidth="14" fill="none" />
          </svg>
        </span>
      );

    case 'MX': // Mexico
      return (
        <span style={containerStyle} className={className} title="Mexico">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="213" height="480" fill="#006847" />
            <rect x="213" width="214" height="480" fill="#FFFFFF" />
            <rect x="427" width="213" height="480" fill="#CE1126" />
            <circle cx="320" cy="240" r="38" fill="#8B5A2B" opacity="0.8" />
            <path d="M305 230 Q320 215 335 230 Q320 260 305 230 Z" fill="#006847" />
          </svg>
        </span>
      );

    case 'TR': // Turkey
      return (
        <span style={containerStyle} className={className} title="Turkey">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#E30A17" />
            <circle cx="280" cy="240" r="110" fill="#FFFFFF" />
            <circle cx="310" cy="240" r="88" fill="#E30A17" />
            <polygon points={createStarPoints(390, 240, 42, 18)} fill="#FFFFFF" />
          </svg>
        </span>
      );

    case 'TH': // Thailand
      return (
        <span style={containerStyle} className={className} title="Thailand">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="80" fill="#A51931" />
            <rect y="80" width="640" height="80" fill="#F4F5F8" />
            <rect y="160" width="640" height="160" fill="#2D2A4A" />
            <rect y="320" width="640" height="80" fill="#F4F5F8" />
            <rect y="400" width="640" height="80" fill="#A51931" />
          </svg>
        </span>
      );

    case 'CZ': // Czech Republic
      return (
        <span style={containerStyle} className={className} title="Czechia">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="240" fill="#FFFFFF" />
            <rect y="240" width="640" height="240" fill="#D7141A" />
            <polygon points="0,0 320,240 0,480" fill="#11457E" />
          </svg>
        </span>
      );

    case 'HU': // Hungary: Red, White, Green
      return (
        <span style={containerStyle} className={className} title="Hungary">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="160" fill="#CE2939" />
            <rect y="160" width="640" height="160" fill="#FFFFFF" />
            <rect y="320" width="640" height="160" fill="#477050" />
          </svg>
        </span>
      );

    case 'SG': // Singapore
      return (
        <span style={containerStyle} className={className} title="Singapore">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="240" fill="#ED2939" />
            <rect y="240" width="640" height="240" fill="#FFFFFF" />
            <circle cx="120" cy="120" r="50" fill="#FFFFFF" />
            <circle cx="140" cy="120" r="45" fill="#ED2939" />
            <polygon points={createStarPoints(150, 100, 10, 4)} fill="#FFFFFF" />
            <polygon points={createStarPoints(168, 118, 10, 4)} fill="#FFFFFF" />
            <polygon points={createStarPoints(160, 140, 10, 4)} fill="#FFFFFF" />
            <polygon points={createStarPoints(136, 140, 10, 4)} fill="#FFFFFF" />
            <polygon points={createStarPoints(130, 118, 10, 4)} fill="#FFFFFF" />
          </svg>
        </span>
      );

    case 'KR': // South Korea
      return (
        <span style={containerStyle} className={className} title="South Korea">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#FFFFFF" />
            <circle cx="320" cy="240" r="90" fill="#CD2E3A" />
            <path d="M230 240a45 45 0 0 0 90 0 45 45 0 0 1 90 0 90 90 0 0 1-180 0z" fill="#0047A0" />
            {/* Trigrams */}
            <rect x="130" y="80" width="50" height="8" fill="#000000" transform="rotate(-34 155 84)" />
            <rect x="120" y="96" width="50" height="8" fill="#000000" transform="rotate(-34 145 100)" />
            <rect x="110" y="112" width="50" height="8" fill="#000000" transform="rotate(-34 135 116)" />
          </svg>
        </span>
      );

    case 'PT': // Portugal
      return (
        <span style={containerStyle} className={className} title="Portugal">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="250" height="480" fill="#006600" />
            <rect x="250" width="390" height="480" fill="#FF0000" />
            <circle cx="250" cy="240" r="50" fill="#FFCC00" />
          </svg>
        </span>
      );

    case 'AE': // United Arab Emirates
      return (
        <span style={containerStyle} className={className} title="United Arab Emirates">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="160" fill="#00732F" />
            <rect y="160" width="640" height="160" fill="#FFFFFF" />
            <rect y="320" width="640" height="160" fill="#000000" />
            <rect width="180" height="480" fill="#FF0000" />
          </svg>
        </span>
      );

    case 'NL': // Netherlands
      return (
        <span style={containerStyle} className={className} title="Netherlands">
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="160" fill="#AE1C28" />
            <rect y="160" width="640" height="160" fill="#FFFFFF" />
            <rect y="320" width="640" height="160" fill="#21468B" />
          </svg>
        </span>
      );

    default: // Global or unknown fallback: clean European Union / Globe style
      return (
        <span style={containerStyle} className={className} title={code || 'Global'}>
          <svg viewBox="0 0 640 480" preserveAspectRatio="none" style={svgStyle}>
            <rect width="640" height="480" fill="#003399" />
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const cx = 320 + Math.sin(angle) * 125;
              const cy = 240 - Math.cos(angle) * 125;
              return <polygon key={i} points={createStarPoints(cx, cy, 18, 7.5)} fill="#FFCC00" />;
            })}
          </svg>
        </span>
      );
  }
}
