"use client";

import React, { useState } from 'react';
import { HelpArticle } from './helpData';
import { useTranslation } from '@/hooks/useTranslation';

interface HelpTopicCardProps {
  article: HelpArticle;
  isSelected?: boolean;
  onClick: (article: HelpArticle) => void;
}

export function HelpTopicCard({ article, isSelected = false, onClick }: HelpTopicCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  // Active / Selected state styling (like the purple highlighted card in the reference image)
  const isFilled = isSelected || isHovered;

  return (
    <button
      type="button"
      onClick={() => onClick(article)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        textAlign: 'left',
        padding: '20px 22px',
        borderRadius: '12px',
        border: isFilled
          ? '1px solid var(--color-ocean, #1B8FA6)'
          : '1px solid var(--color-border, #E2D9CC)',
        background: isFilled
          ? 'linear-gradient(135deg, var(--color-ocean, #1B8FA6) 0%, var(--color-deep-sea, #0F4C5C) 100%)'
          : 'var(--color-surface-card, #FAF6F0)',
        color: isFilled ? '#FFFFFF' : 'var(--color-text-primary, #1A2B32)',
        cursor: 'pointer',
        transition: 'all 0.18s ease-in-out',
        minHeight: '140px',
        boxShadow: isFilled
          ? '0 8px 20px rgba(15, 76, 92, 0.2)'
          : 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.03))',
        transform: isFilled ? 'translateY(-2px)' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div>
        {/* Top Tag & Read Time */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          {article.badge && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: isFilled ? 'rgba(255, 255, 255, 0.2)' : 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))',
                color: isFilled ? '#FFFFFF' : 'var(--color-ocean, #1B8FA6)',
              }}
            >
              {t(article.badge)}
            </span>
          )}

          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: isFilled ? 'rgba(255, 255, 255, 0.8)' : 'var(--color-text-muted, #566B76)',
            }}
          >
            {t(article.readTime)}
          </span>
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 6px 0',
            fontSize: '16px',
            fontWeight: 700,
            lineHeight: 1.3,
            color: isFilled ? '#FFFFFF' : 'var(--color-text-primary, #1A2B32)',
          }}
        >
          {t(article.title)}
        </h3>

        {/* Excerpt */}
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            lineHeight: 1.5,
            color: isFilled ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-muted, #566B76)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {t(article.excerpt)}
        </p>
      </div>

      {/* Footer Arrow & Difficulty indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '14px',
          paddingTop: '8px',
          borderTop: isFilled ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
          fontSize: '11px',
        }}
      >
        <span
          style={{
            color: isFilled ? 'var(--color-gold, #E2B33C)' : 'var(--color-text-muted, #566B76)',
            fontWeight: 600,
          }}
        >
          {article.difficulty ? t(article.difficulty) : t('help.difficulty_guide')}
        </span>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 700,
            color: isFilled ? '#FFFFFF' : 'var(--color-ocean, #1B8FA6)',
          }}
        >
          <span>{t('help.read_btn')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>
    </button>
  );
}
