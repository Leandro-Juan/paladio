"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useNotificationStore } from '@/stores/notificationStore';
import { ToastItem, NotificationType } from '@/types/notification';
import { formatRelativeTime } from '@/utils/date';

const TOAST_THEMES: Record<NotificationType, { border: string; bg: string; icon: string; text: string }> = {
  info: { border: '#2563EB', bg: '#EFF6FF', icon: 'ℹ', text: '#1E40AF' },
  success: { border: '#059669', bg: '#ECFDF5', icon: '✓', text: '#065F46' },
  warning: { border: '#D97706', bg: '#FFFBEB', icon: '▲', text: '#92400E' },
  error: { border: '#DC2626', bg: '#FEF2F2', icon: '✕', text: '#991B1B' },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { notification, durationMs } = toast;
  const theme = TOAST_THEMES[notification.type] || TOAST_THEMES.info;

  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--color-bg-main)',
        borderLeft: `4px solid ${theme.border}`,
        borderTop: '1px solid var(--color-border)',
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        padding: '12px 14px',
        width: '320px',
        display: 'flex',
        gap: '10px',
        position: 'relative',
        animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: theme.bg,
          color: theme.border,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
          flexShrink: 0,
          marginTop: '1px',
        }}
      >
        {theme.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
          <span
            className="font-display"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {notification.title}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '9px',
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>

        <p
          style={{
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            margin: '2px 0 0 0',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {notification.message}
        </p>

        {notification.actionLink && (
          <div style={{ marginTop: '6px' }}>
            <Link
              href={notification.actionLink}
              onClick={onDismiss}
              className="font-mono"
              style={{
                fontSize: '10px',
                color: theme.border,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {notification.actionLabel || 'View'} →
            </Link>
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        title="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '0 4px',
          lineHeight: 1,
          alignSelf: 'flex-start',
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useNotificationStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'auto',
      }}
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
