"use client";

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationItem, NotificationType } from '@/types/notification';
import { formatFullDateTime, formatRelativeTime } from '@/utils/date';
import { BellIcon } from './icons';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_STYLES: Record<NotificationType, { color: string; bg: string; label: string; icon: string }> = {
  info: { color: '#2563EB', bg: '#EFF6FF', label: 'INFO', icon: 'ℹ' },
  success: { color: '#059669', bg: '#ECFDF5', label: 'SUCCESS', icon: '✓' },
  warning: { color: '#D97706', bg: '#FFFBEB', label: 'ALERT', icon: '▲' },
  error: { color: '#DC2626', bg: '#FEF2F2', label: 'ERROR', icon: '✕' },
};

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotificationStore();

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      aria-modal="false"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '8px',
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '520px',
        background: 'var(--color-bg-main)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
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
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <BellIcon size={28} color="var(--color-text-muted)" />
            </div>
            <p className="font-display" style={{ fontSize: '13px', margin: 0 }}>
              No notifications yet
            </p>
            <p className="font-mono" style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
              Engine and telemetry alerts will appear here.
            </p>
          </div>
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
                  background: item.read ? 'transparent' : 'rgba(30, 58, 138, 0.03)',
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
    </div>
  );
}
