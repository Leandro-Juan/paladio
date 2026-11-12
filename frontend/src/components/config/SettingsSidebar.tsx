"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SETTINGS_CATEGORIES, SettingsTabId, SettingCardItem } from './settingsData';
import { SettingsIconRenderer } from './SettingsIconRenderer';
import styles from '@/app/config/config.module.css';

interface SettingsSidebarProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId, subTab?: string) => void;
  isAdmin: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

interface SettingsSuggestionItem {
  id: string;
  tabId: SettingsTabId;
  subTabId?: string;
  title: string;
  subtitle: string;
  category: string;
  iconName: SettingCardItem['iconName'];
  iconTone?: 'coral' | 'teal' | 'gold';
  score: number;
}

function getSettingsSuggestions(query: string, isAdmin: boolean): SettingsSuggestionItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const list: SettingsSuggestionItem[] = [];

  // Check overview
  if ('overview'.includes(q) || 'dashboard'.includes(q) || 'home'.includes(q)) {
    list.push({
      id: 'overview',
      tabId: 'overview',
      title: 'Overview',
      subtitle: 'Workspace & system configuration overview',
      category: 'General',
      iconName: 'layout',
      score: 'overview'.startsWith(q) ? 100 : 60,
    });
  }

  for (const cat of SETTINGS_CATEGORIES) {
    for (const item of cat.items) {
      if (item.requiresAdmin && !isAdmin) continue;

      const titleLower = item.title.toLowerCase();
      const descLower = item.description.toLowerCase();
      const catLower = cat.title.toLowerCase();

      // Check if any subtab matches
      let matchedSubTab: { id: string; label: string } | null = null;
      if (item.subTabs) {
        for (const st of item.subTabs) {
          const stLabelLower = st.label.toLowerCase();
          const stIdLower = st.id.toLowerCase();
          if (stLabelLower.includes(q) || stIdLower.includes(q)) {
            matchedSubTab = st;
            break;
          }
        }
      }

      // Check item itself
      let score = 0;
      let subtitle = cat.title;

      if (titleLower.startsWith(q)) {
        score = 100;
        subtitle = cat.title;
      } else if (titleLower.includes(q)) {
        score = 80;
        subtitle = cat.title;
      } else if (matchedSubTab) {
        score = matchedSubTab.label.toLowerCase().startsWith(q) ? 90 : 80;
        subtitle = `${matchedSubTab.label} · ${cat.title}`;
      } else {
        const matchedKeyword = item.keywords.find((k) => k.toLowerCase().includes(q));
        if (matchedKeyword) {
          score = matchedKeyword.toLowerCase().startsWith(q) ? 75 : 65;
          subtitle = `${matchedKeyword} · ${cat.title}`;
        } else if (descLower.includes(q)) {
          score = 50;
          subtitle = item.description;
        } else if (catLower.includes(q)) {
          score = 35;
          subtitle = cat.title;
        }
      }

      if (score > 0) {
        list.push({
          id: item.id,
          tabId: item.id,
          subTabId: matchedSubTab?.id,
          title: item.title,
          subtitle,
          category: cat.title,
          iconName: item.iconName,
          iconTone: item.iconTone,
          score,
        });
      }
    }
  }

  // Deduplicate by tabId and sort descending by score
  const uniqueMap = new Map<string, SettingsSuggestionItem>();
  for (const item of list) {
    if (!uniqueMap.has(item.id) || uniqueMap.get(item.id)!.score < item.score) {
      uniqueMap.set(item.id, item);
    }
  }

  return Array.from(uniqueMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function SettingsSidebar({
  activeTab,
  onSelectTab,
  isAdmin,
  searchQuery,
  onSearchChange,
}: SettingsSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    return getSettingsSuggestions(searchQuery, isAdmin);
  }, [searchQuery, isAdmin]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectSuggestion = (item: SettingsSuggestionItem) => {
    onSelectTab(item.tabId, item.subTabId);
    onSearchChange('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (searchQuery.trim().length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev + 1 < suggestions.length ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : suggestions.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const target = activeIndex >= 0 && activeIndex < suggestions.length ? suggestions[activeIndex] : suggestions[0];
        handleSelectSuggestion(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <aside className={styles.settingsSidebar} aria-label="Settings Navigation">
      {/* Sidebar Header */}
      <div className={styles.sidebarHeader}>
        <h2 className={styles.sidebarTitle}>Settings</h2>
      </div>

      {/* Quick Search */}
      <div className={styles.sidebarSearchContainer} ref={searchContainerRef}>
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
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (searchQuery.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className={styles.sidebarSearchInput}
          aria-label="Filter settings"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && Boolean(searchQuery.trim())}
          aria-controls="settings-search-dropdown"
        />
        {searchQuery.trim().length > 0 && (
          <button
            type="button"
            className={styles.sidebarSearchClearBtn}
            onClick={() => {
              onSearchChange('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Suggested Search Dropdown Menu */}
        {isOpen && searchQuery.trim().length > 0 && (
          <div id="settings-search-dropdown" className={styles.searchDropdownMenu} role="listbox">
            <div className={styles.searchDropdownList}>
              {suggestions.length === 0 ? (
                <div className={styles.searchDropdownEmpty}>
                  No matching settings found for &quot;{searchQuery}&quot;
                </div>
              ) : (
                suggestions.map((item, idx) => {
                  const isHighlighted = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      className={`${styles.searchDropdownItem} ${isHighlighted ? styles.searchDropdownItemActive : ''}`}
                      onClick={() => handleSelectSuggestion(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <div className={styles.searchDropdownIconBox}>
                        <SettingsIconRenderer
                          name={item.iconName}
                          size={13}
                          color={
                            item.iconTone === 'coral'
                              ? 'var(--color-accent-coral, #E76F51)'
                              : item.iconTone === 'gold'
                              ? 'var(--color-accent-gold, #F4A261)'
                              : 'var(--color-accent-teal, #0F4C5C)'
                          }
                        />
                      </div>
                      <div className={styles.searchDropdownContent}>
                        <span className={styles.searchDropdownTitle}>{item.title}</span>
                        <span className={styles.searchDropdownSubtitle}>{item.subtitle}</span>
                      </div>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: 0.55 }}
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
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
