"use client";

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { TripRevisionChangeItem, TripRevisionItem } from '@/hooks/useTrips';

interface TripActivityTimelineProps {
  items: TripRevisionItem[];
  currentRevision: number;
  loading?: boolean;
  error?: string | null;
  busyActionKey?: string | null;
  onRevertRevision: (revisionId: string) => void;
  onRestoreVersion: (targetRevision: number) => void;
  onRefresh?: () => void;
  onClose?: () => void;
}

function formatRelativeTime(
  isoDate: string,
  nowMs: number,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: string
): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;

  const diffMs = Math.max(0, nowMs - parsed.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return t('activity.just_now');

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('activity.minutes_ago', { count: diffMin });

  const nowDate = new Date(nowMs);
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfTarget = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) {
    const diffHours = Math.floor(diffMin / 60);
    return t('activity.hours_ago', { count: diffHours });
  }
  if (dayDiff === 1) return t('activity.yesterday');
  if (dayDiff < 7) return t('activity.days_ago', { count: dayDiff });

  return new Intl.DateTimeFormat(locale === 'en' ? undefined : locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatExactTime(isoDate: string, locale: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale === 'en' ? undefined : locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
}

interface BadgeStyle {
  bg: string;
  border: string;
  color: string;
}

function getKindBadgeStyle(kind: string): BadgeStyle {
  switch (kind) {
    case 'status':
      return {
        bg: 'var(--color-accent-gold-soft, rgba(226, 179, 60, 0.16))',
        border: 'rgba(226, 179, 60, 0.42)',
        color: '#B58415',
      };
    case 'created':
      return {
        bg: 'rgba(107, 91, 214, 0.11)',
        border: 'rgba(107, 91, 214, 0.28)',
        color: '#6B5BD6',
      };
    case 'route':
    case 'hotel':
    case 'reoptimize':
    case 'itinerary':
      return {
        bg: 'rgba(15, 76, 92, 0.1)',
        border: 'rgba(15, 76, 92, 0.25)',
        color: 'var(--color-accent-primary, #0F4C5C)',
      };
    case 'move':
    case 'dates':
      return {
        bg: 'rgba(99, 102, 241, 0.1)',
        border: 'rgba(99, 102, 241, 0.28)',
        color: '#5B5CE2',
      };
    case 'revert':
    case 'restore':
      return {
        bg: 'rgba(212, 42, 47, 0.09)',
        border: 'rgba(212, 42, 47, 0.28)',
        color: 'var(--color-accent-secondary, #D42A2F)',
      };
    case 'participant':
      return {
        bg: 'var(--color-success-soft, rgba(31, 122, 77, 0.12))',
        border: 'rgba(31, 122, 77, 0.28)',
        color: 'var(--color-success, #1F7A4D)',
      };
    default:
      return {
        bg: 'rgba(27, 143, 166, 0.12)',
        border: 'rgba(27, 143, 166, 0.3)',
        color: 'var(--color-accent-teal-mid, #1B8FA6)',
      };
  }
}

function TimelineKindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'status':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'created':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    case 'route':
    case 'reoptimize':
    case 'itinerary':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v5" />
          <path d="M12 12c0 3.5-4 4.5-4 7" />
          <path d="M12 12c0 3.5 4 4.5 4 7" />
          <path d="M9.5 9.5 12 7l2.5 2.5" />
        </svg>
      );
    case 'move':
    case 'dates':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0-5 5v5" />
        </svg>
      );
    case 'revert':
    case 'restore':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case 'participant':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
  }
}

function ChangeSentence({ change }: { change: TripRevisionChangeItem }) {
  return (
    <>
      <span style={{ color: 'var(--color-text-muted)' }}>{change.verb}</span>{' '}
      {change.before_label && change.connector ? (
        <>
          <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{change.before_label}</strong>{' '}
          <span style={{ color: 'var(--color-text-muted)' }}>{change.connector}</span>{' '}
          <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{change.after_label}</strong>
        </>
      ) : (
        <>
          <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{change.after_label}</strong>
          {change.connector && change.target_label ? (
            <>
              {' '}
              <span style={{ color: 'var(--color-text-muted)' }}>{change.connector}</span>{' '}
              <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{change.target_label}</strong>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

export function TripActivityTimeline({
  items,
  currentRevision,
  loading = false,
  error = null,
  busyActionKey = null,
  onRevertRevision,
  onRestoreVersion,
  onRefresh,
  onClose,
}: TripActivityTimelineProps) {
  const { t, locale } = useTranslation();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      aria-label={t('activity.timeline_aria')}
      data-testid="trip-activity-timeline"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 110px)',
      }}
    >
      {/* Header matching reference image & adapted to Paladio */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-surface-raised)',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {t('activity.title')}
          </h3>
          <span
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(15, 76, 92, 0.1)',
              border: '1px solid rgba(15, 76, 92, 0.2)',
              color: 'var(--color-accent-primary)',
              letterSpacing: '0.03em',
            }}
          >
            {t('activity.rev_badge', { revision: currentRevision })}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title={t('activity.refresh_aria')}
              aria-label={t('activity.refresh_aria')}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-main)',
                color: 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title={t('activity.collapse_title')}
              aria-label={t('activity.close_aria')}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-main)',
                color: 'var(--color-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Timeline Body */}
      <div
        style={{
          padding: '1.25rem',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {error && (
          <div
            className="font-mono"
            style={{
              padding: '0.75rem 0.9rem',
              borderRadius: '8px',
              background: 'var(--color-danger-soft)',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="font-mono text-muted" style={{ fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>
            {t('activity.loading_log')}
          </div>
        ) : items.length === 0 ? (
          <div className="font-mono text-muted" style={{ fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>
            {t('activity.empty_log')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((item, idx) => {
              const isLast = idx === items.length - 1;
              const badge = getKindBadgeStyle(item.kind);
              const primaryChange: TripRevisionChangeItem =
                item.changes && item.changes.length > 0
                  ? item.changes[0]
                  : { kind: item.kind, verb: t('activity.default_verb_updated'), after_label: item.summary };
              const extraChanges = item.changes && item.changes.length > 1 ? item.changes.slice(1) : [];

              const revertKey = `revert:${item.id}`;
              const restoreKey = `restore:${item.revision}`;
              const isAnyBusy = busyActionKey !== null;
              const isRevertingThis = busyActionKey === revertKey;
              const isRestoringThis = busyActionKey === restoreKey;
              const showRevert = item.can_revert && item.revision >= 1;
              const showRestore = !item.is_current && item.revision < currentRevision;

              return (
                <div
                  key={item.id}
                  data-testid={`revision-item-v${item.revision}`}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '14px',
                  }}
                >
                  {/* Left Timeline Rail + Circular Icon */}
                  <div
                    style={{
                      width: '34px',
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '9999px',
                        background: badge.bg,
                        border: `1px solid ${badge.border}`,
                        color: badge.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <TimelineKindIcon kind={item.kind} />
                    </div>
                    {!isLast && (
                      <div
                        style={{
                          width: '1.5px',
                          flex: 1,
                          minHeight: '20px',
                          margin: '6px 0',
                          background: 'var(--color-border)',
                        }}
                      />
                    )}
                  </div>

                  {/* Right Content Column */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingBottom: isLast ? '4px' : '20px',
                      paddingTop: '2px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.88rem',
                        lineHeight: 1.45,
                        color: 'var(--color-text-primary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      <strong style={{ fontWeight: 600 }}>{item.actor_name}</strong>{' '}
                      <ChangeSentence change={primaryChange} />
                    </div>

                    {extraChanges.length > 0 && (
                      <div
                        style={{
                          marginTop: '4px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          paddingLeft: '8px',
                          borderLeft: '2px solid var(--color-border)',
                          fontSize: '0.78rem',
                          lineHeight: 1.4,
                        }}
                      >
                        {extraChanges.map((extra, extraIdx) => (
                          <div key={extraIdx}>
                            <ChangeSentence change={extra} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timestamp & Version Metadata */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '4px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        title={formatExactTime(item.created_at, locale)}
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {formatRelativeTime(item.created_at, nowMs, t, locale)}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.67rem',
                          fontWeight: 600,
                          color: item.is_current ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                          background: item.is_current ? 'rgba(15, 76, 92, 0.1)' : 'var(--color-bg-main)',
                          border: `1px solid ${item.is_current ? 'rgba(15, 76, 92, 0.25)' : 'var(--color-border-subtle)'}`,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {item.is_current ? t('activity.version_current', { revision: item.revision }) : t('activity.version_tag', { revision: item.revision })}
                      </span>
                    </div>

                    {/* Action Controls: Revert specific change / Restore version */}
                    {(showRevert || showRestore) && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {showRevert && (
                          <button
                            type="button"
                            disabled={isAnyBusy}
                            onClick={() => onRevertRevision(item.id)}
                            data-testid={`revert-rev-${item.revision}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-main)',
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: isAnyBusy ? 'not-allowed' : 'pointer',
                              opacity: isAnyBusy && !isRevertingThis ? 0.55 : 1,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 14 4 9l5-5" />
                              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                            </svg>
                            {isRevertingThis ? t('activity.reverting') : t('activity.revert_change')}
                          </button>
                        )}
                        {showRestore && (
                          <button
                            type="button"
                            disabled={isAnyBusy}
                            onClick={() => onRestoreVersion(item.revision)}
                            data-testid={`restore-rev-${item.revision}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              border: '1px solid rgba(15, 76, 92, 0.25)',
                              background: 'rgba(15, 76, 92, 0.08)',
                              color: 'var(--color-accent-primary)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: isAnyBusy ? 'not-allowed' : 'pointer',
                              opacity: isAnyBusy && !isRestoringThis ? 0.55 : 1,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                            {isRestoringThis ? t('activity.restoring') : t('activity.restore_version', { revision: item.revision })}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
