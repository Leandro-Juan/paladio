"use client";

import React, { useState } from 'react';
import Link from 'next/link';

export type WorkspaceTab = 'plan' | 'transports' | 'costs' | 'collab' | 'photos';

interface TripWorkspaceHeaderProps {
  tripId?: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  photosCount?: number;
  participantsCount?: number;
}

const formatDateRange = (start?: string, end?: string): string => {
  if (!start) return '';
  try {
    const dStart = new Date(start);
    if (isNaN(dStart.getTime())) return start;
    const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const startStr = dStart.toLocaleDateString(undefined, opt);
    if (!end) return startStr;
    const dEnd = new Date(end);
    if (isNaN(dEnd.getTime())) return startStr;
    const endStr = dEnd.toLocaleDateString(undefined, opt);
    return `${startStr} — ${endStr}`;
  } catch {
    return start;
  }
};

export function TripWorkspaceHeader({
  destination,
  startDate,
  endDate,
  activeTab,
  onTabChange,
  photosCount = 0,
  participantsCount = 1,
}: TripWorkspaceHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      if (typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const tabs: Array<{ id: WorkspaceTab; label: string; count?: number; iconSvg: string }> = [
    {
      id: 'plan',
      label: 'Plan',
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`,
    },
    {
      id: 'transports',
      label: 'Transports',
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`,
    },
    {
      id: 'costs',
      label: 'Costs',
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    },
    {
      id: 'collab',
      label: 'Collab',
      count: participantsCount,
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    },
    {
      id: 'photos',
      label: 'Photos',
      count: photosCount,
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    },
  ];

  return (
    <header
      style={{
        height: '56px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        background: 'rgba(15, 23, 42, 0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 50,
        flexShrink: 0,
      }}
    >
      {/* Left: Back Link & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
        <Link
          href="/trips"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--color-text-muted, #94A3B8)',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono, monospace)',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '12px' }}>&larr;</span> TRIPS
        </Link>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          <h1
            className="font-display"
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: '#FFFFFF',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '0.5px',
            }}
          >
            {destination}
          </h1>
          {startDate && (
            <span
              className="font-mono text-muted"
              style={{
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                display: 'none',
              }}
              data-dates-badge="true"
            >
              {formatDateRange(startDate, endDate)}
            </span>
          )}
        </div>
      </div>

      {/* Center: Sliding Pill Tabs (TREK Style) */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.70)',
          padding: '3px',
          borderRadius: '999px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '2px',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '999px',
                border: 'none',
                background: isActive ? '#2563EB' : 'transparent',
                color: isActive ? '#FFFFFF' : 'var(--color-text-muted, #94A3B8)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.15s cubic-bezier(0.23, 1, 0.32, 1)',
                boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none',
              }}
            >
              <span
                dangerouslySetInnerHTML={{ __html: tab.iconSvg }}
                style={{ display: 'flex', alignItems: 'center' }}
              />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '999px',
                    background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#FFFFFF' : '#94A3B8',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={handleShare}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            background: copied ? '#10B981' : 'rgba(255, 255, 255, 0.06)',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>{copied ? 'COPIED!' : 'SHARE'}</span>
        </button>
      </div>
    </header>
  );
}
