'use strict';
import React, { useState, useRef, useMemo } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useTypographyStore } from '@/stores/typographyStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import { notify } from '@/utils/notify';

interface ExperienceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'appearance' | 'typography' | 'navigation' | 'maps' | string;
}

export function ExperienceSection({
  onBackToOverview,
}: ExperienceSectionProps) {
  const { theme, setTheme } = useThemeStore();
  const { typography, setTypography, toggleTypography } = useTypographyStore();
  const { navStyle, setNavStyle } = useNavigationStore();

  // Local state for maps preferences
  const [mapTileLayer, setMapTileLayer] = useState<'carto_dark' | 'carto_voyager' | 'osm' | 'satellite'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_map_layer');
      if (stored === 'carto_voyager' || stored === 'osm' || stored === 'satellite') return stored;
    }
    return 'carto_dark';
  });

  const [showTransitLines, setShowTransitLines] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_map_transit_lines') !== 'false';
    }
    return true;
  });

  const handleUpdateMapLayer = (layer: 'carto_dark' | 'carto_voyager' | 'osm' | 'satellite') => {
    setMapTileLayer(layer);
    if (typeof window !== 'undefined') {
      localStorage.setItem('paladio_map_layer', layer);
    }
  };

  const handleToggleTransitLines = (checked: boolean) => {
    setShowTransitLines(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('paladio_map_transit_lines', String(checked));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title="Appearance & Interface"
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Interface Appearance & Theme Engine */}
      <SettingsCardFrame
        title="Pacific Jazz Visual Themes"
        subtitle="Engineered color harmonics designed for day, night, and silent waters navigation"
        badge={theme ? theme.toUpperCase() : 'LIGHT'}
        badgeTone="coral"
        innerTitle="Active Color Surface"
        innerBadge={theme === 'dark' ? 'Pacific Slate' : theme === 'silent-waters' ? 'Silent Waters' : 'Editorial Light'}
        menuItems={[
          {
            id: 'reset_theme',
            label: 'Reset to Light Theme',
            onClick: () => setTheme('light'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {/* Light Mode */}
          <button
            type="button"
            onClick={() => setTheme('light')}
            aria-label="Switch to light mode"
            aria-pressed={theme === 'light'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: theme === 'light' ? '2px solid var(--color-accent-gold, #E2B33C)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.18s ease',
              boxShadow: theme === 'light' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px' }}>
                Pacific Jazz Light
              </span>
              {theme === 'light' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-gold)', color: '#0A2A35' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Warm paper and parchment canvas for high daylight readability.
            </span>
          </button>

          {/* Dark Mode */}
          <button
            type="button"
            onClick={() => setTheme('dark')}
            aria-label="Switch to dark mode"
            aria-pressed={theme === 'dark'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: theme === 'dark' ? '2px solid var(--color-accent-gold, #E2B33C)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.18s ease',
              boxShadow: theme === 'dark' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px' }}>
                Pacific Slate Dark
              </span>
              {theme === 'dark' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-gold)', color: '#0A2A35' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Deep slate petrol canvas reducing glare during nocturnal planning.
            </span>
          </button>

          {/* Silent Waters */}
          <button
            type="button"
            onClick={() => setTheme('silent-waters')}
            aria-label="Switch to silent waters"
            aria-pressed={theme === 'silent-waters'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: theme === 'silent-waters' ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.18s ease',
              boxShadow: theme === 'silent-waters' ? '0 0 16px rgba(42, 140, 130, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px' }}>
                Silent Waters Navy
              </span>
              {theme === 'silent-waters' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Deep oceanic indigo palette curated for maritime and calm focus.
            </span>
          </button>
        </div>
      </SettingsCardFrame>

      {/* 2. Interface Typography */}
      <SettingsCardFrame
        title="Interface Typography Pairings"
        subtitle="Tactical typographic hierarchy balancing modern neutral Inter with editorial Jost accents"
        badge={typography === 'classic' ? 'CLASSIC' : 'INTER'}
        badgeTone="teal"
        innerTitle="Active Font Pairing"
        innerBadge={typography === 'classic' ? 'Classic Jost Editorial' : 'Modern Inter'}
        actionButton={{
          label: typography === 'classic' ? 'Switch to Inter Typography' : 'Switch to Classic Typography',
          onClick: toggleTypography,
        }}
        menuItems={[
          {
            id: 'set_inter',
            label: 'Set typography to Inter (universal)',
            onClick: () => setTypography('inter'),
          },
          {
            id: 'set_classic',
            label: 'Set typography to Classic Editorial',
            onClick: () => setTypography('classic'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <button
            type="button"
            onClick={() => setTypography('inter')}
            aria-label="Set typography to Inter (universal)"
            aria-pressed={typography === 'inter'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: typography === 'inter' ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                Inter Universal
              </span>
              {typography === 'inter' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Clean, modern Swiss neo-grotesque sans-serif with maximal screen legibility.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTypography('classic')}
            aria-label="Set typography to Classic Editorial"
            aria-pressed={typography === 'classic'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: typography === 'classic' ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Jost, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                Classic Jost Editorial
              </span>
              {typography === 'classic' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Geometric 1920s German Futura-inspired typeface delivering warm editorial rhythm.
            </span>
          </button>
        </div>
      </SettingsCardFrame>

      {/* 3. Navigation Presentation */}
      <SettingsCardFrame
        title="Navigation Presentation"
        subtitle="Configure whether your travel workstation uses a floating dock or vertical sidebar rail"
        badge={navStyle === 'dock' ? 'TACTICAL DOCK' : 'SIDEBAR RAIL'}
        badgeTone="teal"
        innerTitle="Active Shell Mode"
        innerBadge={navStyle === 'dock' ? 'Floating Dock' : 'Sidebar Rail'}
        menuItems={[
          {
            id: 'set_dock',
            label: 'Activate Floating Dock',
            onClick: () => setNavStyle('dock'),
          },
          {
            id: 'set_sidebar',
            label: 'Activate Sidebar Rail',
            onClick: () => setNavStyle('sidebar'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <button
            type="button"
            onClick={() => setNavStyle('dock')}
            aria-label="Set navigation to Floating Bottom Dock"
            aria-pressed={navStyle === 'dock'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: navStyle === 'dock' ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '15px' }}>Floating Tactical Dock</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Centrally docked floating pill maximizing map viewport area.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setNavStyle('sidebar')}
            aria-label="Set navigation to Sidebar"
            aria-pressed={navStyle === 'sidebar'}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: navStyle === 'sidebar' ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '15px' }}>Desktop Sidebar Rail</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Fixed vertical rail providing immediate multi-tab access at the screen edge.
            </span>
          </button>
        </div>
      </SettingsCardFrame>

      {/* 4. Cartography & Map Layers */}
      <SettingsCardFrame
        title="Cartography & Map Layers"
        subtitle="Select sovereign vector/raster tile providers and configure transit line route overlays"
        badge={mapTileLayer.toUpperCase()}
        badgeTone="gold"
        innerTitle="Active Map Style"
        innerBadge={mapTileLayer.replace('_', ' ').toUpperCase()}
        menuItems={[
          {
            id: 'reset_map',
            label: 'Reset to CartoDB Dark Matter',
            onClick: () => handleUpdateMapLayer('carto_dark'),
          },
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              { id: 'carto_dark', label: 'CartoDB Dark Matter', desc: 'Minimalist dark vectors' },
              { id: 'carto_voyager', label: 'CartoDB Voyager', desc: 'Warm daylight editorial' },
              { id: 'osm', label: 'OpenStreetMap Standard', desc: 'Detailed local topography' },
              { id: 'satellite', label: 'High-Res Satellite', desc: 'Aerial satellite imagery' },
            ].map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => handleUpdateMapLayer(layer.id as any)}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: mapTileLayer === layer.id ? '2px solid var(--color-accent-gold, #E2B33C)' : '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{layer.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{layer.desc}</span>
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Transit Route Overlays
              </span>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                Render compiled GTFS metro, tram, and rail vectors on map canvas
              </p>
            </div>
            <TacticalToggle
              checked={showTransitLines}
              onChange={handleToggleTransitLines}
              tone="teal"
              ariaLabel="Toggle transit lines on map"
            />
          </div>
        </div>
      </SettingsCardFrame>
    </div>
  );
}
