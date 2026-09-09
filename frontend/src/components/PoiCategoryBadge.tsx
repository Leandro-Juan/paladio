"use client";

import React from 'react';
import { classifyPoiCategory, PoiCategoryType } from '@/utils/poiCategory';

interface PoiCategoryBadgeProps {
  category?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
}

function CategoryIcon({ type, size = 12 }: { type: PoiCategoryType; size?: number }) {
  switch (type) {
    case 'museum':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2L2 7h20L12 2z" />
        </svg>
      );
    case 'restaurant':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 2v20M21 15V2a5 5 0 0 0-5 5v8h5zM3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M6 11v11" />
        </svg>
      );
    case 'cafe':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
        </svg>
      );
    case 'bus_stop':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 16h16M4 6h16M7 21v-2M17 21v-2M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 12h.01M15 12h.01" />
        </svg>
      );
    case 'transit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="16" rx="2" />
          <path d="M4 11h16M12 3v8M8 19l-3 3M16 19l3 3M8 15h.01M16 15h.01" />
        </svg>
      );
    case 'hotel':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
        </svg>
      );
    case 'bar':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 22h8M12 11v11M19 3l-7 8-7-8h14z" />
        </svg>
      );
    case 'landmark':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L9 22h6L12 2zM12 2v20M8 12h8" />
        </svg>
      );
    case 'park':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7M7 17l5-5 5 5" />
        </svg>
      );
    case 'flight':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z" />
        </svg>
      );
    case 'airport':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
        </svg>
      );
    case 'shopping':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'attraction':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
  }
}

export function PoiCategoryBadge({
  category,
  name,
  size = 'sm',
  showIcon = true,
}: PoiCategoryBadgeProps) {
  const meta = classifyPoiCategory(category, name);

  const padding = size === 'xs' ? '1px 5px' : size === 'md' ? '4px 10px' : '2px 7px';
  const fontSize = size === 'xs' ? '0.65rem' : size === 'md' ? '0.8rem' : '0.7rem';
  const iconSize = size === 'xs' ? 10 : size === 'md' ? 14 : 11;

  return (
    <span
      data-testid="poi-category-badge"
      data-category-type={meta.type}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        fontSize,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        borderRadius: '4px',
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.borderColor}`,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
        userSelect: 'none',
      }}
    >
      {showIcon && <CategoryIcon type={meta.type} size={iconSize} />}
      <span>{meta.label}</span>
    </span>
  );
}
