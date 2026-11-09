"use client";

import React, { useMemo } from 'react';
import { SETTINGS_CATEGORIES, SettingCardItem, SettingsTabId } from './settingsData';
import { SettingsIconRenderer } from './SettingsIconRenderer';
import styles from '@/app/config/config.module.css';

interface SettingsOverviewProps {
  onSelectTab: (tab: SettingsTabId) => void;
  isAdmin: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  telemetrySummary?: {
    themeName?: string;
    typographyName?: string;
    localeCode?: string;
    currencyCode?: string;
    llmProvider?: string;
    gtfsCompiledCount?: number;
    userCount?: number;
    containerOnlineCount?: number;
    updateAvailable?: boolean;
  };
}

export function SettingsOverview({
  onSelectTab,
  isAdmin,
  searchQuery,
  onSearchChange,
  telemetrySummary,
}: SettingsOverviewProps) {
  const query = searchQuery.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    return SETTINGS_CATEGORIES.map((cat) => {
      const visibleItems = cat.items.filter((item) => {
        if (item.requiresAdmin && !isAdmin) return false;
        if (!query) return true;
        const inTitle = item.title.toLowerCase().includes(query);
        const inDesc = item.description.toLowerCase().includes(query);
        const inKeywords = item.keywords.some((k) => k.toLowerCase().includes(query));
        const inCategory = cat.title.toLowerCase().includes(query);
        return inTitle || inDesc || inKeywords || inCategory;
      });

      return {
        ...cat,
        items: visibleItems,
      };
    }).filter((cat) => cat.items.length > 0);
  }, [query, isAdmin]);

  const getItemBadge = (id: SettingsTabId): { text: string; active?: boolean } | null => {
    if (!telemetrySummary) return null;
    switch (id) {
      case 'appearance':
        return telemetrySummary.themeName ? { text: telemetrySummary.themeName, active: true } : null;
      case 'typography':
        return telemetrySummary.typographyName ? { text: telemetrySummary.typographyName } : null;
      case 'language':
        return telemetrySummary.localeCode ? { text: telemetrySummary.localeCode.toUpperCase(), active: true } : null;
      case 'currency':
        return telemetrySummary.currencyCode ? { text: telemetrySummary.currencyCode, active: true } : null;
      case 'llm':
        return telemetrySummary.llmProvider ? { text: telemetrySummary.llmProvider.toUpperCase(), active: true } : null;
      case 'transit':
        return typeof telemetrySummary.gtfsCompiledCount === 'number'
          ? { text: `${telemetrySummary.gtfsCompiledCount} ACTIVE`, active: telemetrySummary.gtfsCompiledCount > 0 }
          : null;
      case 'users':
        return typeof telemetrySummary.userCount === 'number'
          ? { text: `${telemetrySummary.userCount} USERS` }
          : null;
      case 'updates':
        return telemetrySummary.updateAvailable
          ? { text: 'UPDATE READY', active: true }
          : { text: 'UP TO DATE' };
      case 'telemetry':
        return typeof telemetrySummary.containerOnlineCount === 'number'
          ? { text: `${telemetrySummary.containerOnlineCount}/5 ONLINE`, active: true }
          : null;
      case 'maps':
        return { text: 'CARTO DARK' };
      case 'units':
        return { text: 'METRIC / 24H', active: true };
      case 'solver':
        return { text: '12 KM/DAY', active: true };
      case 'deals':
        return { text: 'CADENCE: 24H' };
      case 'swarm':
        return { text: 'STRICT: 75%', active: true };
      case 'memory':
        return { text: '16-D ACTIVE', active: true };
      case 'vault':
        return { text: 'SNAPSHOTS: ON', active: true };
      default:
        return null;
    }
  };

  const getToneClass = (tone?: 'coral' | 'teal' | 'gold') => {
    if (tone === 'teal') return styles.cardIconBoxTeal;
    if (tone === 'gold') return styles.cardIconBoxGold;
    return styles.cardIconBox;
  };

  return (
    <div className={styles.settingsCanvas}>
      {/* Overview Hero Section */}
      <div className={styles.overviewHero}>
        <h1 className={styles.overviewTitle}>Settings</h1>
        <p className={styles.overviewSubtitle}>
          Configure your workspace, localization, routing engine, swarm intelligence, and sovereign system.
        </p>

        {/* Big Search Bar */}
        <div className={styles.heroSearchContainer}>
          <svg
            className={styles.heroSearchIcon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search settings..."
            className={styles.heroSearchInput}
            aria-label="Search settings catalog"
          />
        </div>
      </div>

      {filteredCategories.length === 0 ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--color-surface-card)', borderRadius: '10px', border: '1px solid var(--color-border-subtle)' }}>
          <p className="font-display" style={{ fontSize: '15px', color: 'var(--color-text-primary)', margin: 0 }}>
            No settings found matching &ldquo;{searchQuery}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => onSearchChange('')}
            style={{
              marginTop: '10px',
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              color: 'var(--color-accent-teal)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear Search
          </button>
        </div>
      ) : (
        filteredCategories.map((cat) => (
          <section key={cat.id} className={styles.overviewSection}>
            <div className={styles.overviewSectionHeader}>
              <h2 className={styles.overviewSectionTitle}>{cat.title}</h2>
              <p className={styles.overviewSectionSubtitle}>{cat.subtitle}</p>
            </div>

            <div className={styles.cardsGrid}>
              {cat.items.map((item: SettingCardItem) => {
                const badge = getItemBadge(item.id);
                const displayBadgeText = badge?.text || item.statusBadge;
                const isBadgeActive = badge ? badge.active : true;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={styles.settingCard}
                    aria-label={`Open ${item.title}`}
                  >
                    <div className={getToneClass(item.iconTone)}>
                      <SettingsIconRenderer name={item.iconName} size={18} />
                    </div>

                    <div className={styles.cardContent}>
                      <div className={styles.cardHeaderRow}>
                        <h3 className={styles.cardTitle}>{item.title}</h3>
                        {displayBadgeText && (
                          <span className={`${styles.cardBadge} ${isBadgeActive ? styles.cardBadgeActive : styles.cardBadgeMuted}`}>
                            {displayBadgeText}
                          </span>
                        )}
                      </div>
                      <p className={styles.cardDescription}>{item.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
