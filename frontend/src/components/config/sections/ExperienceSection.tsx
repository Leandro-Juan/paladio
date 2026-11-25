'use strict';
import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/stores/themeStore';
import { useTypographyStore } from '@/stores/typographyStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';

interface ExperienceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'appearance' | 'typography' | 'navigation' | 'maps' | string;
  initialSubTab?: string;
}

type ExperienceTabKey = 'theme' | 'typography' | 'navigation' | 'maps';

function resolveExperienceSubTab(subTab?: string, initialSubTab?: string): ExperienceTabKey {
  const candidate = (initialSubTab || subTab || 'theme').toLowerCase();
  if (candidate === 'typography') return 'typography';
  if (candidate === 'navigation') return 'navigation';
  if (candidate === 'maps') return 'maps';
  return 'theme';
}

const EXPERIENCE_SUBTABS: Array<{ id: ExperienceTabKey; label: string }> = [
  { id: 'theme', label: 'Color Themes' },
  { id: 'typography', label: 'Typography' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'maps', label: 'Cartography' },
];

export function ExperienceSection({
  onBackToOverview,
  subTab = 'appearance',
  initialSubTab,
}: ExperienceSectionProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const { typography, setTypography, toggleTypography } = useTypographyStore();
  const { navStyle, setNavStyle } = useNavigationStore();

  const resolvedFromProps = resolveExperienceSubTab(subTab, initialSubTab);
  const [prevPropKey, setPrevPropKey] = useState(`${subTab}:${initialSubTab ?? ''}`);
  const [activeSubTab, setActiveSubTab] = useState<ExperienceTabKey>(resolvedFromProps);
  const {
    containerRef: subTabListRef,
    registerItem: registerSubTab,
    indicatorStyle: subTabIndicatorStyle,
    isReady: subTabIndicatorReady,
    animate: subTabAnimate,
  } = useSlidingIndicator<ExperienceTabKey>(activeSubTab);

  const currentPropKey = `${subTab}:${initialSubTab ?? ''}`;
  if (currentPropKey !== prevPropKey) {
    setPrevPropKey(currentPropKey);
    setActiveSubTab(resolvedFromProps);
  }

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
      window.dispatchEvent(new Event('paladio_map_layer_changed'));
    }
  };

  const handleToggleTransitLines = (checked: boolean) => {
    setShowTransitLines(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('paladio_map_transit_lines', String(checked));
    }
  };

  const themeBadgeText =
    theme === 'dark'
      ? t('config.theme_badge_dark_upper')
      : theme === 'silent-waters'
      ? t('config.theme_badge_silent_upper')
      : t('config.theme_badge_light_upper');

  const mapBadgeMap: Record<string, string> = {
    carto_dark: t('config.map_badge_carto_dark'),
    carto_voyager: t('config.map_badge_carto_voyager'),
    osm: t('config.map_badge_osm'),
    satellite: t('config.map_badge_satellite'),
  };

  const mapInnerBadgeMap: Record<string, string> = {
    carto_dark: t('config.map_layer_carto_dark_upper'),
    carto_voyager: t('config.map_layer_carto_voyager_upper'),
    osm: t('config.map_layer_osm_upper'),
    satellite: t('config.map_layer_satellite_upper'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SettingsHeader
        title={t('config.item_appearance_title')}
        subtitle={t('config.appearance_header_subtitle')}
        onBackToOverview={onBackToOverview}
      />

      {/* Horizontal Sub-Tab Switcher */}
      <div
        ref={subTabListRef}
        role="tablist"
        aria-label={t('config.appearance_subtabs_aria')}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          backgroundColor: 'var(--color-bg-main, #F7F5F0)',
          padding: '4px',
          borderRadius: '9999px',
          border: '1px solid var(--color-border, #E2DDD5)',
          gap: '4px',
          width: 'fit-content',
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        <div
          aria-hidden="true"
          className="paladio-sliding-pill"
          data-animate={subTabAnimate ? 'true' : 'false'}
          style={{
            ...subTabIndicatorStyle,
            borderRadius: '9999px',
            backgroundColor: 'var(--color-surface-card, #FFFFFF)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
            zIndex: 0,
          }}
        />
        {EXPERIENCE_SUBTABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={registerSubTab(tab.id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor:
                  isActive && !subTabIndicatorReady
                    ? 'var(--color-surface-card, #FFFFFF)'
                    : 'transparent',
                color: isActive ? 'var(--color-accent-teal, #2A8C82)' : 'var(--color-text-muted, #718096)',
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                boxShadow:
                  isActive && !subTabIndicatorReady
                    ? '0 1px 3px rgba(0, 0, 0, 0.08)'
                    : 'none',
                transition: 'color var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              {t(tab.label)}
            </button>
          );
        })}
      </div>

      <div key={activeSubTab} className="animate-tab-pane">
      {/* 1. Interface Appearance & Theme Engine */}
      {activeSubTab === 'theme' && (
      <SettingsCardFrame
        title={t('config.themes_card_title')}
        subtitle={t('config.themes_card_subtitle')}
        badge={themeBadgeText}
        badgeTone="coral"
        innerTitle={t('config.themes_inner_title')}
        innerBadge={
          theme === 'dark'
            ? t('config.themes_inner_dark')
            : theme === 'silent-waters'
            ? t('config.themes_inner_silent')
            : t('config.themes_inner_light')
        }
        menuItems={[
          {
            id: 'reset_theme',
            label: t('config.reset_light_theme'),
            onClick: () => setTheme('light'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {/* Light Mode */}
          <button
            type="button"
            onClick={() => setTheme('light')}
            aria-label={t('config.switch_light_aria')}
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
                {t('config.theme_light_name')}
              </span>
              {theme === 'light' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-gold)', color: '#0A2A35' }}>
                  {t('config.badge_active_upper')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.theme_light_desc')}
            </span>
          </button>

          {/* Dark Mode */}
          <button
            type="button"
            onClick={() => setTheme('dark')}
            aria-label={t('config.switch_dark_aria')}
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
                {t('config.theme_dark_card_name')}
              </span>
              {theme === 'dark' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-gold)', color: '#0A2A35' }}>
                  {t('config.badge_active_upper')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.theme_dark_desc')}
            </span>
          </button>

          {/* Silent Waters */}
          <button
            type="button"
            onClick={() => setTheme('silent-waters')}
            aria-label={t('config.switch_silent_aria')}
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
                {t('config.theme_silent_card_name')}
              </span>
              {theme === 'silent-waters' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  {t('config.badge_active_upper')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.theme_silent_desc')}
            </span>
          </button>
        </div>
      </SettingsCardFrame>
      )}

      {/* 2. Interface Typography */}
      {activeSubTab === 'typography' && (
      <SettingsCardFrame
        title={t('config.typography_card_title')}
        subtitle={t('config.typography_card_subtitle')}
        badge={typography === 'classic' ? t('config.typography_badge_classic') : t('config.typography_badge_inter')}
        badgeTone="teal"
        innerTitle={t('config.typography_inner_title')}
        innerBadge={typography === 'classic' ? t('config.typography_classic_card_name') : t('config.typography_inner_inter')}
        actionButton={{
          label: typography === 'classic' ? t('config.switch_to_inter_btn') : t('config.switch_to_classic_btn'),
          onClick: toggleTypography,
        }}
        menuItems={[
          {
            id: 'set_inter',
            label: t('config.set_typography_inter'),
            onClick: () => setTypography('inter'),
          },
          {
            id: 'set_classic',
            label: t('config.set_typography_classic'),
            onClick: () => setTypography('classic'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <button
            type="button"
            onClick={() => setTypography('inter')}
            aria-label={t('config.set_typography_inter')}
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
                {t('config.typography_inter_card_name')}
              </span>
              {typography === 'inter' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  {t('config.badge_active_upper')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.typography_inter_desc')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTypography('classic')}
            aria-label={t('config.set_typography_classic')}
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
                {t('config.typography_classic_card_name')}
              </span>
              {typography === 'classic' && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-accent-teal)', color: '#FFFFFF' }}>
                  {t('config.badge_active_upper')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.typography_classic_desc')}
            </span>
          </button>
        </div>
      </SettingsCardFrame>
      )}

      {/* 3. Navigation Presentation */}
      {activeSubTab === 'navigation' && (
      <SettingsCardFrame
        title={t('config.nav_card_title')}
        subtitle={t('config.nav_card_subtitle')}
        badge={navStyle === 'dock' ? t('config.nav_badge_dock') : t('config.nav_badge_sidebar')}
        badgeTone="teal"
        innerTitle={t('config.nav_inner_title')}
        innerBadge={navStyle === 'dock' ? t('config.nav_inner_dock') : t('config.nav_inner_sidebar')}
        menuItems={[
          {
            id: 'set_dock',
            label: t('config.activate_dock_menu'),
            onClick: () => setNavStyle('dock'),
          },
          {
            id: 'set_sidebar',
            label: t('config.activate_sidebar_menu'),
            onClick: () => setNavStyle('sidebar'),
          },
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <button
            type="button"
            onClick={() => setNavStyle('dock')}
            aria-label={t('config.set_nav_dock_aria')}
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
            <span style={{ fontWeight: 600, fontSize: '15px' }}>{t('config.nav_dock_title')}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.nav_dock_desc')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setNavStyle('sidebar')}
            aria-label={t('config.set_nav_sidebar_aria')}
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
            <span style={{ fontWeight: 600, fontSize: '15px' }}>{t('config.nav_sidebar_title')}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('config.nav_sidebar_desc')}
            </span>
          </button>
        </div>
      </SettingsCardFrame>
      )}

      {/* 4. Cartography & Map Layers */}
      {activeSubTab === 'maps' && (
      <SettingsCardFrame
        title={t('config.maps_card_title')}
        subtitle={t('config.maps_card_subtitle')}
        badge={mapBadgeMap[mapTileLayer] || mapTileLayer.toUpperCase()}
        badgeTone="gold"
        innerTitle={t('config.maps_inner_title')}
        innerBadge={mapInnerBadgeMap[mapTileLayer] || mapTileLayer.replace('_', ' ').toUpperCase()}
        menuItems={[
          {
            id: 'reset_map',
            label: t('config.reset_map_menu'),
            onClick: () => handleUpdateMapLayer('carto_dark'),
          },
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              { id: 'carto_dark', label: t('config.map_carto_dark_label'), desc: t('config.map_carto_dark_desc') },
              { id: 'carto_voyager', label: t('config.map_carto_voyager_label'), desc: t('config.map_carto_voyager_desc') },
              { id: 'osm', label: t('config.map_osm_label'), desc: t('config.map_osm_desc') },
              { id: 'satellite', label: t('config.map_satellite_label'), desc: t('config.map_satellite_desc') },
            ].map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => handleUpdateMapLayer(layer.id as 'carto_dark' | 'carto_voyager' | 'osm' | 'satellite')}
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
                {t('config.transit_route_overlays_title')}
              </span>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                {t('config.transit_route_overlays_desc')}
              </p>
            </div>
            <TacticalToggle
              checked={showTransitLines}
              onChange={handleToggleTransitLines}
              tone="teal"
              ariaLabel={t('config.toggle_transit_lines_aria')}
            />
          </div>
        </div>
      </SettingsCardFrame>
      )}
      </div>
    </div>
  );
}
