"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTranslation } from '@/hooks/useTranslation';
import { ToastItem, NotificationType } from '@/types/notification';
import { formatRelativeTime } from '@/utils/date';
import { InfoIcon, CheckIcon, AlertTriangleIcon, CloseIcon, ChevronRightIcon } from '@/components/icons';

const TOAST_THEMES: Record<NotificationType, { border: string; bg: string; icon: React.ReactNode; text: string }> = {
  info: { border: 'var(--color-link)', bg: 'rgba(15, 76, 92, 0.08)', icon: <InfoIcon size={12} />, text: 'var(--color-link)' },
  success: { border: 'var(--color-success)', bg: 'rgba(31, 122, 77, 0.1)', icon: <CheckIcon size={12} />, text: 'var(--color-success)' },
  warning: { border: 'var(--color-accent-warning)', bg: 'var(--color-accent-warning-bg)', icon: <AlertTriangleIcon size={12} />, text: 'var(--color-accent-warning)' },
  error: { border: 'var(--color-danger)', bg: 'rgba(179, 38, 30, 0.1)', icon: <CloseIcon size={12} />, text: 'var(--color-danger)' },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { t, locale } = useTranslation();
  const { notification, durationMs } = toast;
  const theme = TOAST_THEMES[notification.type] || TOAST_THEMES.info;
  const [isClosing, setIsClosing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(durationMs);
  const startedAtRef = useRef<number | null>(null);
  const closeStartedRef = useRef(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const triggerClose = useCallback(() => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;
    setIsClosing(true);
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    closeTimeoutRef.current = window.setTimeout(() => {
      onDismissRef.current();
    }, prefersReduced ? 80 : 150);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (durationMs <= 0 || isClosing || isPaused) return;
    const ms = Math.max(0, remainingRef.current);
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      remainingRef.current = 0;
      triggerClose();
    }, ms);

    return () => {
      window.clearTimeout(timer);
      if (startedAtRef.current !== null) {
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
        startedAtRef.current = null;
      }
    };
  }, [durationMs, isClosing, isPaused, triggerClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="paladio-toast"
      data-state={isClosing ? 'closing' : 'open'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        background: 'var(--color-surface-card)',
        borderLeft: `4px solid ${theme.border}`,
        borderTop: '1px solid var(--color-border)',
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: '12px 14px',
        width: '320px',
        display: 'flex',
        gap: '10px',
        position: 'relative',
        overflow: 'hidden',
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
            {t(notification.title)}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '9px',
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelativeTime(notification.timestamp, locale)}
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
          {t(notification.message)}
        </p>

        {notification.actionLink && (
          <div style={{ marginTop: '6px' }}>
            <Link
              href={notification.actionLink}
              onClick={triggerClose}
              className="font-mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                color: theme.border,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {notification.actionLabel ? t(notification.actionLabel) : t('common.view')} <ChevronRightIcon size={10} />
            </Link>
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={triggerClose}
        title={t('notifications.dismiss')}
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

      {durationMs > 0 && (
        <div
          aria-hidden="true"
          className="paladio-toast-progress"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '2px',
            background: theme.border,
            opacity: 0.65,
            animationDuration: `${durationMs}ms`,
          }}
        />
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useNotificationStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print"
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
