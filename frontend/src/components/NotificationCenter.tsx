"use client";

import React, { useRef, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationItem, NotificationType } from '@/types/notification';
import { formatFullDateTime, formatRelativeTime } from '@/utils/date';
import { EmptyState } from './EmptyState';

import { InfoIcon, CheckIcon, AlertTriangleIcon, CloseIcon } from '@/components/icons';

const emptySubscribe = () => () => {};

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  placement?: 'top' | 'bottom';
  triggerRef?: React.RefObject<HTMLElement | null>;
}

const TYPE_STYLES: Record<NotificationType, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
  info: { color: 'var(--color-link)', bg: 'rgba(15, 76, 92, 0.08)', label: 'INFO', icon: <InfoIcon size={12} /> },
  success: { color: 'var(--color-success)', bg: 'rgba(31, 122, 77, 0.1)', label: 'SUCCESS', icon: <CheckIcon size={12} /> },
  warning: { color: 'var(--color-accent-warning)', bg: 'var(--color-accent-warning-bg)', label: 'ALERT', icon: <AlertTriangleIcon size={12} /> },
  error: { color: 'var(--color-danger)', bg: 'rgba(179, 38, 30, 0.1)', label: 'ERROR', icon: <CloseIcon size={12} /> },
};

export function NotificationCenter({ isOpen, onClose, placement = 'bottom', triggerRef }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotificationStore();

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const [stylePos, setStylePos] = useState<React.CSSProperties>({
    position: 'fixed',
    top: '60px',
    left: '20px',
    zIndex: 1000,
  });

  // Calculate coordinates based on triggerRef
  useEffect(() => {
    if (!isOpen) return;

    const updatePos = () => {
      if (!triggerRef?.current) {
        setStylePos({
          position: 'fixed',
          top: '60px',
          left: '20px',
          width: '380px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '520px',
          zIndex: 1000,
        });
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const panelWidth = Math.min(380, window.innerWidth - 32);

      if (placement === 'top') {
        const bottom = window.innerHeight - rect.top + 10;
        let left = rect.left;
        if (left + panelWidth > window.innerWidth - 16) {
          left = window.innerWidth - panelWidth - 16;
        }
        if (left < 16) left = 16;

        setStylePos({
          position: 'fixed',
          bottom: `${bottom}px`,
          left: `${left}px`,
          width: `${panelWidth}px`,
          maxHeight: '520px',
          zIndex: 1000,
        });
      } else {
        const top = rect.bottom + 8;
        let left = rect.left;
        // In sidebar header, adjust so panel doesn't overflow rightwards awkwardly
        if (rect.left < 260) {
          left = Math.max(12, Math.min(rect.left - 40, window.innerWidth - panelWidth - 16));
        } else if (left + panelWidth > window.innerWidth - 16) {
          left = window.innerWidth - panelWidth - 16;
        }
        if (left < 16) left = 16;

        setStylePos({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${panelWidth}px`,
          maxHeight: '520px',
          zIndex: 1000,
        });
      }
    };

    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isOpen, triggerRef, placement]);

  // Close on Escape or click outside (ignoring clicks on the trigger button)
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef?.current && triggerRef.current.contains(target)) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || !isClient) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      aria-modal="false"
      style={{
        ...stylePos,
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.16))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 className="font-display" style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span
              className="font-mono"
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'var(--color-accent-primary)',
                color: '#FFF',
                fontWeight: 600,
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="font-mono"
              title="Mark all as read"
              style={{
                fontSize: '11px',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-accent-primary)',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Read all
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="font-mono"
              title="Clear all notifications"
              style={{
                fontSize: '11px',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '440px',
        }}
      >
        {notifications.length === 0 ? (
          <EmptyState
            type="no-notifications"
            title="No Notifications Yet"
            description="Engine alerts and telemetry updates will appear here."
            style={{ border: 'none', background: 'transparent', padding: '2rem 1rem' }}
          />
        ) : (
          notifications.map((item: NotificationItem) => {
            const style = TYPE_STYLES[item.type] || TYPE_STYLES.info;

            return (
              <div
                key={item.id}
                onClick={() => !item.read && markAsRead(item.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--color-border)',
                  background: item.read ? 'transparent' : 'rgba(15, 76, 92, 0.05)',
                  display: 'flex',
                  gap: '12px',
                  position: 'relative',
                  transition: 'background 0.15s ease',
                  cursor: item.read ? 'default' : 'pointer',
                }}
              >
                {/* Type Icon Indicator */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: style.bg,
                    color: style.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {style.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '2px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className="font-display"
                        style={{
                          fontSize: '13px',
                          fontWeight: item.read ? 500 : 600,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {item.title}
                      </span>
                      {!item.read && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--color-accent-primary)',
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </div>

                    {/* Relative timestamp */}
                    <span
                      className="font-mono"
                      title={formatFullDateTime(item.timestamp)}
                      style={{
                        fontSize: '10px',
                        color: 'var(--color-text-muted)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  {/* Message body */}
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      margin: '0 0 6px 0',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.message}
                  </p>

                  {/* Full Date & Time metadata */}
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-muted)',
                      opacity: 0.8,
                      marginBottom: item.actionLink ? '6px' : '0',
                    }}
                  >
                    {formatFullDateTime(item.timestamp)}
                  </div>

                  {/* Optional Action Button */}
                  {item.actionLink && (
                    <div style={{ marginTop: '6px' }}>
                      <Link
                        href={item.actionLink}
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(item.id);
                          onClose();
                        }}
                        className="font-mono"
                        style={{
                          display: 'inline-block',
                          fontSize: '10px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: style.bg,
                          color: style.color,
                          border: `1px solid ${style.color}33`,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {item.actionLabel || 'View Details'} →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Dismiss button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(item.id);
                  }}
                  title="Remove notification"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '4px',
                    alignSelf: 'flex-start',
                    opacity: 0.5,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.color = '#DC2626';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.opacity = '0.5';
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}
