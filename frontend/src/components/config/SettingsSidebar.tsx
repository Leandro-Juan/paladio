"use client";

import React from 'react';
import { SETTINGS_CATEGORIES, SettingsTabId } from './settingsData';
import { SettingsIconRenderer } from './SettingsIconRenderer';
import styles from '@/app/config/config.module.css';

interface SettingsSidebarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  isAdmin: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function SettingsSidebar({
  activeTab,
  onSelectTab,
  isAdmin,
  searchQuery,
  onSearchChange,
}: SettingsSidebarProps) {
  return (
    <aside className={styles.settingsSidebar} aria-label="Settings Navigation">
      {/* Sidebar Header */}
      <div className={styles.sidebarHeader}>
        <h2 className={styles.sidebarTitle}>Settings</h2>
      </div>

      {/* Quick Search */}
      <div className={styles.sidebarSearchContainer}>
        <svg
          className={styles.sidebarSearchIcon}
          width="13"
          height="13"
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
          placeholder="Search..."
          className={styles.sidebarSearchInput}
          aria-label="Filter settings"
        />
      </div>

      {/* Overview Top Pill */}
      <button
        type="button"
        onClick={() => onSelectTab('overview')}
        className={`${styles.overviewPill} ${activeTab === 'overview' ? styles.overviewPillActive : ''}`}
        aria-current={activeTab === 'overview' ? 'page' : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SettingsIconRenderer name="layout" size={14} color={activeTab === 'overview' ? 'var(--color-accent-secondary)' : 'currentColor'} />
          <span>Overview</span>
        </div>
      </button>

      {/* Grouped Category Nav Items */}
      {SETTINGS_CATEGORIES.map((cat) => {
        const visibleItems = cat.items.filter((item) => !item.requiresAdmin || isAdmin);
        if (visibleItems.length === 0) return null;

        return (
          <div key={cat.id} className={styles.navGroup}>
            <div className={styles.navGroupTitle}>{cat.title}</div>
            {visibleItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className={styles.navItemContent}>
                    <SettingsIconRenderer
                      name={item.iconName}
                      size={14}
                      color={isActive ? 'var(--color-accent-teal)' : 'var(--color-text-muted)'}
                    />
                    <span>{item.title}</span>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
