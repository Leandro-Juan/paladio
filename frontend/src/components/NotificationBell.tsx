"use client";

import React, { useState, useRef } from 'react';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationCenter } from './NotificationCenter';

interface NotificationBellProps {
  placement?: 'top' | 'bottom';
}

export function NotificationBell({ placement = 'bottom' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        title="View Notifications"
        style={{
          position: 'relative',
          background: isOpen ? 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))' : 'transparent',
          border: 'none',
          borderRadius: '6px',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-text-muted, #566B76)',
          transition: 'all 0.15s ease',
        }}
        onMouseOver={(e) => {
          if (!isOpen) {
            e.currentTarget.style.color = 'var(--color-text-primary, #1A2B32)';
            e.currentTarget.style.background = 'var(--color-surface-hover, rgba(15, 76, 92, 0.05))';
          }
        }}
        onMouseOut={(e) => {
          if (!isOpen) {
            e.currentTarget.style.color = 'var(--color-text-muted, #566B76)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Bell Icon SVG */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {/* Unread Badge Counter */}
        {unreadCount > 0 && (
          <span
            className="font-mono"
            style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              background: 'var(--color-accent-secondary, #D42A2F)',
              color: '#FFFFFF',
              fontSize: '9px',
              fontWeight: 700,
              minWidth: '15px',
              height: '15px',
              borderRadius: '8px',
              padding: '0 3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 2px var(--color-surface-card, #FAF6F0)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        placement={placement}
        triggerRef={buttonRef}
      />
    </div>
  );
}
