"use client";

import React, { useState, Suspense, useTransition, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { HELP_CATEGORIES, HelpArticle } from '@/components/help/helpData';
import { HelpSidebar } from '@/components/help/HelpSidebar';
import { HelpCategoryHero } from '@/components/help/HelpCategoryHero';
import { HelpTopicCard } from '@/components/help/HelpTopicCard';
import { HelpArticleView } from '@/components/help/HelpArticleView';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { ChevronLeftIcon } from '@/components/icons';
import styles from './help.module.css';

function getHelpViewKey(categoryId: string, articleId: string | null): string {
  return `${categoryId}::${articleId ?? '__hub__'}`;
}

function HelpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeCategoryId = searchParams?.get('cat') || 'getting-started';
  const selectedArticleId = searchParams?.get('doc') || searchParams?.get('article') || null;

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Per-instance reading & scroll tracking (resets cleanly whenever user leaves and reopens /help)
  const contentAreaRef = useRef<HTMLElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const visitedTabsRef = useRef<Set<string>>(new Set());
  const tabLastArticleRef = useRef<Map<string, string | null>>(new Map());
  const isRestoringScrollRef = useRef(false);

  useEffect(() => {
    const scrollPositions = scrollPositionsRef.current;
    const visitedTabs = visitedTabsRef.current;
    const tabLastArticles = tabLastArticleRef.current;
    return () => {
      scrollPositions.clear();
      visitedTabs.clear();
      tabLastArticles.clear();
    };
  }, []);

  // Current category object
  const activeCategory = HELP_CATEGORIES.find((c) => c.id === activeCategoryId) || HELP_CATEGORIES[0];

  // Current selected article object
  const selectedArticle = selectedArticleId
    ? HELP_CATEGORIES.flatMap((c) => c.articles).find((a) => a.id === selectedArticleId) || null
    : null;

  useLayoutEffect(() => {
    const container = contentAreaRef.current;
    if (!container) return;

    const viewKey = getHelpViewKey(activeCategoryId, selectedArticleId);
    visitedTabsRef.current.add(activeCategoryId);
    tabLastArticleRef.current.set(activeCategoryId, selectedArticleId);

    const targetScroll = scrollPositionsRef.current.get(viewKey) ?? 0;
    container.scrollTop = targetScroll;

    let rafId1: number | null = null;
    let rafId2: number | null = null;
    if (targetScroll > 0) {
      isRestoringScrollRef.current = true;
      rafId1 = window.requestAnimationFrame(() => {
        if (contentAreaRef.current) {
          contentAreaRef.current.scrollTop = targetScroll;
        }
        rafId2 = window.requestAnimationFrame(() => {
          if (contentAreaRef.current) {
            contentAreaRef.current.scrollTop = targetScroll;
          }
          isRestoringScrollRef.current = false;
        });
      });
    } else {
      isRestoringScrollRef.current = false;
    }

    return () => {
      if (rafId1 !== null) window.cancelAnimationFrame(rafId1);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isRestoringScrollRef.current = false;
    };
  }, [activeCategoryId, selectedArticleId]);

  const snapshotCurrentReadingState = useCallback(() => {
    const container = contentAreaRef.current;
    const viewKey = getHelpViewKey(activeCategoryId, selectedArticleId);
    if (container) {
      scrollPositionsRef.current.set(viewKey, container.scrollTop);
    }
    visitedTabsRef.current.add(activeCategoryId);
    tabLastArticleRef.current.set(activeCategoryId, selectedArticleId);
  }, [activeCategoryId, selectedArticleId]);

  const handleContentScroll = (e: React.UIEvent<HTMLElement>) => {
    if (isRestoringScrollRef.current) return;
    const viewKey = getHelpViewKey(activeCategoryId, selectedArticleId);
    scrollPositionsRef.current.set(viewKey, e.currentTarget.scrollTop);
    visitedTabsRef.current.add(activeCategoryId);
    tabLastArticleRef.current.set(activeCategoryId, selectedArticleId);
  };

  // Navigation handlers
  const handleSelectCategory = (categoryId: string) => {
    setIsMobileSidebarOpen(false);
    snapshotCurrentReadingState();

    if (categoryId === activeCategoryId) {
      tabLastArticleRef.current.set(categoryId, null);
      startTransition(() => {
        router.push(`/help?cat=${categoryId}`, { scroll: false });
      });
      return;
    }

    const hasVisitedTarget = visitedTabsRef.current.has(categoryId);
    const lastArticleId = hasVisitedTarget
      ? tabLastArticleRef.current.get(categoryId) ?? null
      : null;

    const targetUrl = lastArticleId
      ? `/help?cat=${categoryId}&doc=${lastArticleId}`
      : `/help?cat=${categoryId}`;

    startTransition(() => {
      router.push(targetUrl, { scroll: false });
    });
  };

  const handleSelectArticle = (article: HelpArticle) => {
    setIsMobileSidebarOpen(false);
    snapshotCurrentReadingState();

    visitedTabsRef.current.add(article.categoryId);
    tabLastArticleRef.current.set(article.categoryId, article.id);

    startTransition(() => {
      router.push(`/help?cat=${article.categoryId}&doc=${article.id}`, { scroll: false });
    });
  };

  // Other categories for "Explore Other Sections" footer
  const otherCategories = HELP_CATEGORIES.filter((c) => c.id !== activeCategoryId);

  return (
    <div className={styles.helpContainer}>
      {/* Global Top Navigation Bar (Clean, uncluttered, no search or theme toggle) */}
      <header className={styles.helpHeader}>
        <div className={styles.brandArea}>
          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className={styles.mobileMenuToggle}
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            aria-label="Toggle navigation drawer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link href="/dashboard" className={styles.brandLogo} title="Paladio Dashboard">
            <div className="logo-mark" aria-hidden="true" style={{ width: '28px', height: '28px' }}>
              <div className="logo-icon-sun" style={{ width: '26px', height: '26px' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '0.5px' }}>PALADIO</span>
          </Link>

          <span className={styles.helpBadge}>HELP CENTER</span>
        </div>

        {/* Header Right Actions */}
        <div className={styles.headerActions}>
          <Link href="/dashboard" className={styles.backBtn} aria-label="Back to App">
            <ChevronLeftIcon size={14} aria-hidden="true" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className={styles.helpBody}>
        {/* Left Navigation Sidebar with Search Input */}
        <HelpSidebar
          selectedCategoryId={activeCategoryId}
          selectedArticleId={selectedArticleId}
          onSelectCategory={handleSelectCategory}
          onSelectArticle={handleSelectArticle}
        />

        {/* Right Main Content Area */}
        <main
          ref={contentAreaRef}
          onScroll={handleContentScroll}
          className={styles.helpContentArea}
          data-testid="help-content-area"
        >
          {selectedArticle ? (
            /* Mode 1: Detailed Article View */
            <HelpArticleView
              article={selectedArticle}
              onNavigateCategory={handleSelectCategory}
              onSelectArticle={handleSelectArticle}
            />
          ) : (
            /* Mode 2: Category Hub View */
            <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
              {/* Breadcrumbs */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text-muted, #566B76)',
                  marginBottom: '16px',
                }}
              >
                <span style={{ fontWeight: 500 }}>Help center</span>
                <span>/</span>
                <span style={{ color: 'var(--color-text-primary, #1A2B32)', fontWeight: 600 }}>
                  {activeCategory.title}
                </span>
              </div>

              {/* Thematic Hero Card with Vector Schematic */}
              <HelpCategoryHero
                categoryId={activeCategory.id}
                title={activeCategory.title}
                subtitle={activeCategory.subtitle}
                articleCount={activeCategory.articles.length}
              />

              {/* 3-Column Topic Cards Grid */}
              <div className={styles.topicCardGrid}>
                {activeCategory.articles.map((article: HelpArticle) => (
                  <HelpTopicCard
                    key={article.id}
                    article={article}
                    isSelected={selectedArticleId === article.id}
                    onClick={handleSelectArticle}
                  />
                ))}
              </div>

              {/* "Explore Other Sections" Section */}
              <section className={styles.moreSection}>
                <h2 className={styles.moreTitle}>Explore Other Sections</h2>
                <div className={styles.moreGrid}>
                  {otherCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className={styles.moreItemCard}
                    >
                      <span className={styles.moreItemCategory}>
                        {cat.articles.length} GUIDES
                      </span>
                      <span className={styles.moreItemTitle}>{cat.title}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted, #566B76)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {cat.subtitle}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={<PaladioLoader variant="fullscreen" />}>
      <HelpPageInner />
    </Suspense>
  );
}
