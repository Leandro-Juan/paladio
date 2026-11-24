"use client";

import React, { useState } from 'react';
import { HELP_CATEGORIES, HelpCategory, HelpArticle } from './helpData';
import { useTranslation } from '@/hooks/useTranslation';

interface HelpSidebarProps {
  selectedCategoryId: string;
  selectedArticleId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onSelectArticle: (article: HelpArticle) => void;
}

export function HelpSidebar({
  selectedCategoryId,
  selectedArticleId,
  onSelectCategory,
  onSelectArticle,
}: HelpSidebarProps) {
  const { t } = useTranslation();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategoryCollapse = (categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  return (
    <aside
      style={{
        width: '280px',
        flexShrink: 0,
        borderRight: '1px solid var(--color-border, #E2D9CC)',
        background: 'var(--color-surface-subtle, #FAF6F0)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Search Input Box (No K icon, clean input) */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted, #566B76)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('help.search_sidebar_placeholder')}
            aria-label={t('help.search_guides_aria')}
            style={{
              width: '100%',
              padding: '8px 28px 8px 32px',
              borderRadius: '8px',
              background: 'var(--color-surface-card, #FFFFFF)',
              border: '1px solid var(--color-border, #E2D9CC)',
              color: 'var(--color-text-primary, #1A2B32)',
              fontSize: '12px',
              outline: 'none',
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
              fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                color: 'var(--color-text-muted, #566B76)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={t('config.clear_search_aria')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tree */}
      <nav style={{ padding: '12px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {HELP_CATEGORIES.map((cat: HelpCategory) => {
          const isCategoryActive = selectedCategoryId === cat.id;
          const isCollapsed = Boolean(collapsedCategories[cat.id]);

          // Filter articles by searchQuery across English originals and active translations
          const q = searchQuery.trim().toLowerCase();
          const matchesQuery = (text?: string) =>
            Boolean(text && (text.toLowerCase().includes(q) || t(text).toLowerCase().includes(q)));
          const articles = q
            ? cat.articles.filter(
                (a) =>
                  matchesQuery(a.title) ||
                  matchesQuery(a.excerpt) ||
                  matchesQuery(a.tldr) ||
                  matchesQuery(a.badge) ||
                  a.sections.some(
                    (s) =>
                      matchesQuery(s.heading) ||
                      s.content.some((p) => matchesQuery(p)) ||
                      (s.parameterTable &&
                        s.parameterTable.some(
                          (pt) => matchesQuery(pt.term) || matchesQuery(pt.meaning)
                        ))
                  )
              )
            : cat.articles;

          // If filtering and this category has no matches, skip it
          if (q && articles.length === 0) return null;

          return (
            <div key={cat.id}>
              {/* Category Group Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: isCategoryActive && !selectedArticleId ? 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))' : 'transparent',
                  color: isCategoryActive ? 'var(--color-ocean, #1B8FA6)' : 'var(--color-text-muted, #566B76)',
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  userSelect: 'none',
                }}
                onClick={() => onSelectCategory(cat.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={(e) => toggleCategoryCollapse(cat.id, e)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'inherit',
                    }}
                    aria-label={t('help.toggle_category_aria', { title: t(cat.title) })}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {t(cat.title)}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono, monospace)',
                    opacity: 0.7,
                  }}
                >
                  {articles.length}
                </span>
              </div>

              {/* Sub-articles */}
              {!isCollapsed && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: '3px 0 0 14px',
                    padding: '0 0 0 10px',
                    borderLeft: '1px solid var(--color-border, #E2D9CC)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  {articles.map((article: HelpArticle) => {
                    const isArticleActive = selectedArticleId === article.id;

                    return (
                      <li key={article.id}>
                        <button
                          type="button"
                          onClick={() => onSelectArticle(article)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: 'none',
                            background: isArticleActive
                              ? 'var(--color-ocean, #1B8FA6)'
                              : 'transparent',
                            color: isArticleActive
                              ? '#FFFFFF'
                              : 'var(--color-text-primary, #1A2B32)',
                            fontSize: '12px',
                            fontWeight: isArticleActive ? 600 : 400,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              paddingRight: '6px',
                            }}
                          >
                            {t(article.title)}
                          </span>

                          {article.badge && (
                            <span
                              style={{
                                fontSize: '9px',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                background: isArticleActive
                                  ? 'rgba(255, 255, 255, 0.25)'
                                  : 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))',
                                color: isArticleActive
                                  ? '#FFFFFF'
                                  : 'var(--color-text-muted, #566B76)',
                                flexShrink: 0,
                                fontWeight: 700,
                              }}
                            >
                              {t(article.badge)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer System Info */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--color-text-muted, #566B76)',
        }}
      >
        <span>{t('help.travel_guides_brand')}</span>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>v3.0.0</span>
      </div>
    </aside>
  );
}
