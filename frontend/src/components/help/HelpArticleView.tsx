"use client";

import React from 'react';
import Image from 'next/image';
import { HelpArticle, HELP_CATEGORIES } from './helpData';
import { useTranslation } from '@/hooks/useTranslation';
import {
  TimelineUiMockup,
  RouteComparisonMockup,
  RealismRadarMockup,
  CostKnapsackMockup,
  SwarmAssistantMockup,
  TransitRoutingMockup,
  WalletPassbookMockup,
  RouteMonitoringMockup,
} from './HelpUiMockups';

interface HelpArticleViewProps {
  article: HelpArticle;
  onNavigateCategory: (categoryId: string) => void;
  onSelectArticle: (article: HelpArticle) => void;
}

/**
 * Tactical Info Icon (replaces lightbulb emoji)
 */
function InfoIcon({ color = 'var(--color-ocean, #1B8FA6)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/**
 * Tactical Warning Icon (replaces warning emoji)
 */
function WarningIcon({ color = 'var(--color-danger, #B3261E)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Tactical Star / Tip Icon (replaces sparkles emoji)
 */
function TipIcon({ color = 'var(--color-accent-gold, #E2B33C)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/**
 * Camera / Screenshot icon for caption
 */
function ScreenshotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function HelpArticleView({
  article,
  onNavigateCategory,
  onSelectArticle,
}: HelpArticleViewProps) {
  const { t } = useTranslation();
  const category = HELP_CATEGORIES.find((c) => c.id === article.categoryId);

  // Render matching visual mockup
  const renderMockup = () => {
    switch (article.mockupType) {
      case 'timeline':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_timeline_title')}
            </div>
            <TimelineUiMockup />
          </div>
        );
      case 'route-comparison':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_route_comparison_title')}
            </div>
            <RouteComparisonMockup />
          </div>
        );
      case 'realism-radar':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_realism_radar_title')}
            </div>
            <RealismRadarMockup />
          </div>
        );
      case 'cost-knapsack':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_cost_knapsack_title')}
            </div>
            <CostKnapsackMockup />
          </div>
        );
      case 'transit-routing':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_transit_routing_title')}
            </div>
            <TransitRoutingMockup />
          </div>
        );
      case 'wallet-passbook':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_wallet_passbook_title')}
            </div>
            <WalletPassbookMockup />
          </div>
        );
      case 'route-monitoring':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_route_monitoring_title')}
            </div>
            <RouteMonitoringMockup />
          </div>
        );
      case 'swarm-assistant':
        return (
          <div style={{ margin: '24px 0 32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--color-ocean, #1B8FA6)', marginBottom: '8px' }}>
              {t('help.mockup_swarm_assistant_title')}
            </div>
            <SwarmAssistantMockup />
          </div>
        );
      default:
        return null;
    }
  };

  // Find related articles
  const relatedArticles = article.relatedArticleIds
    ? HELP_CATEGORIES.flatMap((c) => c.articles).filter((a) =>
        article.relatedArticleIds?.includes(a.id)
      )
    : [];

  return (
    <article style={{ maxWidth: '840px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Breadcrumbs */}
      <nav
        aria-label={t('help.breadcrumbs_aria')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--color-text-muted, #566B76)',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => onNavigateCategory(article.categoryId)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'inherit',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {t('help.breadcrumb_home')}
        </button>
        <span>/</span>
        <button
          type="button"
          onClick={() => onNavigateCategory(article.categoryId)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'inherit',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {category ? t(category.title) : t('help.guides_fallback')}
        </button>
        <span>/</span>
        <span style={{ color: 'var(--color-text-primary, #1A2B32)', fontWeight: 600 }}>
          {t(article.title)}
        </span>
      </nav>

      {/* Header Info */}
      <header style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          {article.badge && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.6px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))',
                color: 'var(--color-ocean, #1B8FA6)',
              }}
            >
              {t(article.badge)}
            </span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #566B76)' }}>
            {t('help.read_time_full', { time: t(article.readTime) })}
          </span>
          {article.difficulty && (
            <>
              <span style={{ color: 'var(--color-border, #E2D9CC)' }}>•</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent-gold, #E2B33C)' }}>
                {t(article.difficulty)}
              </span>
            </>
          )}
        </div>

        <h1
          style={{
            margin: '0 0 12px 0',
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.6px',
            color: 'var(--color-text-primary, #1A2B32)',
            lineHeight: 1.25,
          }}
        >
          {t(article.title)}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: '16px',
            lineHeight: 1.6,
            color: 'var(--color-text-muted, #566B76)',
          }}
        >
          {t(article.excerpt)}
        </p>
      </header>

      {/* TL;DR Box */}
      <div
        style={{
          background: 'var(--color-surface-card, #FAF6F0)',
          borderLeft: '4px solid var(--color-ocean, #1B8FA6)',
          borderRadius: '0 10px 10px 0',
          padding: '16px 20px',
          marginBottom: '28px',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.04))',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            color: 'var(--color-ocean, #1B8FA6)',
            marginBottom: '4px',
          }}
        >
          {t('help.key_takeaway')}
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-primary, #1A2B32)' }}>
          {t(article.tldr)}
        </div>
      </div>

      {/* Real Project Screenshot if available */}
      {article.screenshotUrl && (
        <div style={{ margin: '24px 0 32px' }}>
          <div
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--color-border, #E2D9CC)',
              boxShadow: '0 4px 16px rgba(15, 76, 92, 0.08)',
              background: 'var(--color-surface-card, #FAF6F0)',
            }}
          >
            {/* Next.js Image */}
            <Image
              src={article.screenshotUrl}
              alt={article.screenshotCaption ? t(article.screenshotCaption) : t(article.title)}
              width={800}
              height={480}
              unoptimized
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                maxHeight: '480px',
                objectFit: 'cover',
                objectPosition: 'top',
              }}
            />
            {article.screenshotCaption && (
              <div
                style={{
                  padding: '10px 16px',
                  fontSize: '12px',
                  color: 'var(--color-text-muted, #566B76)',
                  background: 'var(--color-surface-subtle, #FAF6F0)',
                  borderTop: '1px solid var(--color-border, #E2D9CC)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ScreenshotIcon />
                <span>{t(article.screenshotCaption)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Mockup if configured */}
      {renderMockup()}

      {/* Article Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {article.sections.map((sec, index) => (
          <section key={index}>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #1A2B32)',
                margin: '0 0 12px 0',
                borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
                paddingBottom: '8px',
              }}
            >
              {t(sec.heading)}
            </h2>

            {/* Paragraphs */}
            {sec.content.map((p, pIdx) => (
              <p
                key={pIdx}
                style={{
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: 'var(--color-text-primary, #1A2B32)',
                  margin: '0 0 12px 0',
                }}
              >
                {t(p)}
              </p>
            ))}

            {/* Steps if any */}
            {sec.steps && (
              <ol
                style={{
                  margin: '14px 0 18px 20px',
                  padding: 0,
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: 'var(--color-text-primary, #1A2B32)',
                }}
              >
                {sec.steps.map((st, sIdx) => (
                  <li key={sIdx} style={{ marginBottom: '6px' }}>
                    {t(st)}
                  </li>
                ))}
              </ol>
            )}

            {/* Callout if any (NO EMOJIS, CLEAN SVG ICONS) */}
            {sec.callout && (
              <div
                style={{
                  margin: '18px 0',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  background:
                    sec.callout.type === 'important'
                      ? 'rgba(15, 76, 92, 0.08)'
                      : sec.callout.type === 'warning'
                      ? 'rgba(179, 38, 30, 0.08)'
                      : 'rgba(226, 179, 60, 0.12)',
                  border: `1px solid ${
                    sec.callout.type === 'important'
                      ? 'var(--color-ocean, #1B8FA6)'
                      : sec.callout.type === 'warning'
                      ? 'var(--color-danger, #B3261E)'
                      : 'var(--color-accent-gold, #E2B33C)'
                  }`,
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--color-text-primary, #1A2B32)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                {sec.callout.type === 'important' ? (
                  <InfoIcon color="var(--color-ocean, #1B8FA6)" />
                ) : sec.callout.type === 'warning' ? (
                  <WarningIcon color="var(--color-danger, #B3261E)" />
                ) : (
                  <TipIcon color="var(--color-accent-gold, #E2B33C)" />
                )}
                <div>{t(sec.callout.text)}</div>
              </div>
            )}

            {/* Parameter Table if any */}
            {sec.parameterTable && (
              <div
                style={{
                  margin: '18px 0',
                  overflowX: 'auto',
                  border: '1px solid var(--color-border, #E2D9CC)',
                  borderRadius: '8px',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr style={{ background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.05))', borderBottom: '1px solid var(--color-border, #E2D9CC)' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.table_col_setting')}</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.table_col_what')}</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.table_col_options')}</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.table_col_example')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.parameterTable.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          borderBottom: rIdx < sec.parameterTable!.length - 1 ? '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))' : 'none',
                          background: rIdx % 2 === 1 ? 'var(--color-surface-subtle, #FAF6F0)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-ocean, #1B8FA6)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {t(row.term)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--color-text-primary)' }}>
                          {t(row.meaning)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                          {t(row.rangeOrType)}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {t(row.defaultOrExample)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Related Guides Footer */}
      {relatedArticles.length > 0 && (
        <footer
          style={{
            marginTop: '48px',
            paddingTop: '24px',
            borderTop: '1px solid var(--color-border, #E2D9CC)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted, #566B76)',
              marginBottom: '14px',
            }}
          >
            {t('help.related_guides_title')}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px',
            }}
          >
            {relatedArticles.map((rel) => (
              <button
                key={rel.id}
                type="button"
                onClick={() => onSelectArticle(rel)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: 'var(--color-surface-card, #FAF6F0)',
                  border: '1px solid var(--color-border, #E2D9CC)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ocean, #1B8FA6)' }}>
                  {t(rel.title)}
                </span>
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
                  {t(rel.excerpt)}
                </span>
              </button>
            ))}
          </div>
        </footer>
      )}
    </article>
  );
}
