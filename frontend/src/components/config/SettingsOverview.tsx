"use client";

import React, { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { SETTINGS_CATEGORIES, SettingCardItem, SettingsTabId } from './settingsData';
import { SettingsIconRenderer } from './SettingsIconRenderer';
import { Modal } from '@/components/Modal';
import styles from '@/app/config/config.module.css';

interface SettingsOverviewProps {
  onSelectTab: (tab: SettingsTabId) => void;
  isAdmin: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRestoreDefaults?: () => Promise<void>;
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
    mapLayerName?: string;
    unitSummary?: string;
    maxWalkingKm?: number;
    dealCadenceHours?: number;
    autoSnapshotsEnabled?: boolean;
  };
}

export function SettingsOverview({
  onSelectTab,
  isAdmin,
  searchQuery,
  onSearchChange,
  onRestoreDefaults,
  telemetrySummary,
}: SettingsOverviewProps) {
  const { t } = useTranslation();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const query = searchQuery.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    return SETTINGS_CATEGORIES.map((cat) => {
      const visibleItems = cat.items.filter((item) => {
        if (item.requiresAdmin && !isAdmin) return false;
        if (!query) return true;
        const inTitle =
          item.title.toLowerCase().includes(query) ||
          t(item.title).toLowerCase().includes(query);
        const inDesc =
          item.description.toLowerCase().includes(query) ||
          t(item.description).toLowerCase().includes(query);
        const inKeywords = item.keywords.some((k) => k.toLowerCase().includes(query));
        const inCategory =
          cat.title.toLowerCase().includes(query) ||
          t(cat.title).toLowerCase().includes(query);
        const inSubTabs = Boolean(
          item.subTabs?.some(
            (st) =>
              st.label.toLowerCase().includes(query) ||
              t(st.label).toLowerCase().includes(query)
          )
        );
        return inTitle || inDesc || inKeywords || inCategory || inSubTabs;
      });

      return {
        ...cat,
        items: visibleItems,
      };
    }).filter((cat) => cat.items.length > 0);
  }, [query, isAdmin, t]);

  const getItemBadge = (id: SettingsTabId): { text: string; active?: boolean } | null => {
    if (!telemetrySummary) return null;
    switch (id) {
      case 'profile':
        return telemetrySummary.localeCode && telemetrySummary.currencyCode
          ? { text: `${telemetrySummary.localeCode.toUpperCase()} · ${telemetrySummary.currencyCode}`, active: true }
          : { text: t('config.badge_active_upper'), active: true };
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
          ? { text: t('config.badge_count_active', { count: telemetrySummary.gtfsCompiledCount }), active: telemetrySummary.gtfsCompiledCount > 0 }
          : null;
      case 'users':
        return typeof telemetrySummary.userCount === 'number'
          ? { text: t('config.badge_count_users', { count: telemetrySummary.userCount }) }
          : null;
      case 'updates':
        return telemetrySummary.updateAvailable
          ? { text: t('config.badge_update_ready'), active: true }
          : { text: t('config.badge_up_to_date') };
      case 'maps':
        return telemetrySummary.mapLayerName ? { text: telemetrySummary.mapLayerName } : null;
      case 'units':
        return telemetrySummary.unitSummary ? { text: telemetrySummary.unitSummary, active: true } : null;
      case 'solver':
        return typeof telemetrySummary.maxWalkingKm === 'number'
          ? { text: t('config.badge_km_day', { km: telemetrySummary.maxWalkingKm }), active: true }
          : null;
      case 'vault':
        return typeof telemetrySummary.autoSnapshotsEnabled === 'boolean'
          ? {
              text: telemetrySummary.autoSnapshotsEnabled ? t('config.badge_snapshots_on') : t('config.badge_manual'),
              active: telemetrySummary.autoSnapshotsEnabled,
            }
          : null;
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 className={styles.overviewTitle}>{t('nav.config')}</h1>
            <p className={styles.overviewSubtitle}>
              {t('config.overview_subtitle_full')}
            </p>
          </div>
          {onRestoreDefaults && (
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-card)',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-danger, #D32F2F)';
                e.currentTarget.style.color = 'var(--color-danger, #D32F2F)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.color = 'var(--color-text-muted)';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>{t('config.restore_defaults_btn')}</span>
            </button>
          )}
        </div>

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
            placeholder={t('config.search_settings_placeholder')}
            className={styles.heroSearchInput}
            aria-label={t('config.search_settings_aria')}
          />
        </div>
      </div>

      {filteredCategories.length === 0 ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--color-surface-card)', borderRadius: '10px', border: '1px solid var(--color-border-subtle)' }}>
          <p className="font-display" style={{ fontSize: '15px', color: 'var(--color-text-primary)', margin: 0 }}>
            {t('config.no_settings_matching', { query: searchQuery })}
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
            {t('config.clear_search_btn')}
          </button>
        </div>
      ) : (
        filteredCategories.map((cat) => (
          <section key={cat.id} className={styles.overviewSection}>
            <div className={styles.overviewSectionHeader}>
              <h2 className={styles.overviewSectionTitle}>{t(cat.title)}</h2>
              <p className={styles.overviewSectionSubtitle}>{t(cat.subtitle)}</p>
            </div>

            <div className={styles.cardsGrid}>
              {cat.items.map((item: SettingCardItem) => {
                const badge = getItemBadge(item.id);
                const displayBadgeText = badge?.text || (item.statusBadge ? t(item.statusBadge) : undefined);
                const isBadgeActive = badge ? badge.active : true;
                const localizedTitle = t(item.title);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={styles.settingCard}
                    aria-label={t('config.open_setting_aria', { title: localizedTitle })}
                  >
                    <div className={getToneClass(item.iconTone)}>
                      <SettingsIconRenderer name={item.iconName} size={18} />
                    </div>

                    <div className={styles.cardContent}>
                      <div className={styles.cardHeaderRow}>
                        <h3 className={styles.cardTitle}>{localizedTitle}</h3>
                        {displayBadgeText && (
                          <span className={`${styles.cardBadge} ${isBadgeActive ? styles.cardBadgeActive : styles.cardBadgeMuted}`}>
                            {displayBadgeText}
                          </span>
                        )}
                      </div>
                      <p className={styles.cardDescription}>{t(item.description)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {onRestoreDefaults && (
        <Modal
          isOpen={isResetModalOpen}
          variant="warning"
          title={t('config.restore_modal_title')}
          message={t('config.restore_modal_message')}
          confirmText={isResetting ? t('config.restoring_upper') : t('config.restore_defaults_upper')}
          cancelText={t('config.cancel_upper')}
          onConfirm={async () => {
            setIsResetting(true);
            try {
              await onRestoreDefaults();
              setIsResetModalOpen(false);
            } finally {
              setIsResetting(false);
            }
          }}
          onCancel={() => {
            if (!isResetting) setIsResetModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
