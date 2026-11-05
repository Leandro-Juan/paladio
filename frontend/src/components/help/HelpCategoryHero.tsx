"use client";

import React from 'react';
import {
  GettingStartedIllustration,
  TripsHeroIllustration,
  RoutesHeroIllustration,
  CostsHeroIllustration,
  MapHeroIllustration,
  SwarmHeroIllustration,
  GlossaryHeroIllustration,
  SettingsHeroIllustration,
} from './HelpCategoryIllustrations';

interface HelpCategoryHeroProps {
  categoryId: string;
  title: string;
  subtitle: string;
  articleCount?: number;
}

export function HelpCategoryHero({
  categoryId,
  title,
  subtitle,
  articleCount,
}: HelpCategoryHeroProps) {
  // Render matching bespoke illustration
  const renderIllustration = () => {
    switch (categoryId) {
      case 'getting-started':
        return <GettingStartedIllustration width={200} height={130} />;
      case 'trips':
        return <TripsHeroIllustration width={200} height={130} />;
      case 'routes':
        return <RoutesHeroIllustration width={200} height={130} />;
      case 'costs':
        return <CostsHeroIllustration width={200} height={130} />;
      case 'map':
        return <MapHeroIllustration width={200} height={130} />;
      case 'swarm':
        return <SwarmHeroIllustration width={200} height={130} />;
      case 'settings':
        return <SettingsHeroIllustration width={200} height={130} />;
      case 'glossary':
      default:
        return <GlossaryHeroIllustration width={200} height={130} />;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, var(--color-deep-sea, #0F4C5C) 0%, var(--color-hero-bg, #0A3642) 100%)',
        color: '#FFFFFF',
        padding: '32px 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md, 0 4px 12px rgba(15, 76, 92, 0.15))',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '28px',
      }}
    >
      {/* Background ambient glow circle */}
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27, 143, 166, 0.35) 0%, rgba(15, 76, 92, 0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Text Info */}
      <div style={{ maxWidth: '640px', zIndex: 1 }}>
        {articleCount !== undefined && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--color-sky, #7CC4D1)',
              marginBottom: '12px',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span>{articleCount} GUIDES &amp; WALKTHROUGHS</span>
          </div>
        )}

        <h1
          style={{
            margin: '0 0 10px 0',
            fontSize: '28px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: '#FFFFFF',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'rgba(240, 246, 246, 0.88)',
            maxWidth: '560px',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Vector Illustration */}
      <div
        style={{
          flexShrink: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '12px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        }}
      >
        {renderIllustration()}
      </div>
    </div>
  );
}
