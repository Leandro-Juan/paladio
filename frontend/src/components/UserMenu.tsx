"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';

interface UserMenuProps {
  isCollapsed?: boolean;
  dockMode?: boolean;
  placement?: 'top' | 'bottom';
}

export function UserMenu({ isCollapsed = false, dockMode = false, placement = 'top' }: UserMenuProps) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);
  const popoverOrigin =
    placement === 'bottom'
      ? 'top-right'
      : dockMode
      ? 'bottom-right'
      : 'bottom-left';

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const roleBadge = isAdmin
    ? t('nav.admin_badge')
    : user.role === 'user'
    ? t('nav.user_role_upper')
    : user.role.toUpperCase();
  const initial = (user.username || 'U').charAt(0).toUpperCase();
  const avatarUrl = (user.preferences?.avatar_url || user.preferences?.pfp) as string | undefined;

  const handleSettingsClick = () => {
    setIsOpen(false);
    router.push('/config');
  };

  const handleHelpClick = () => {
    setIsOpen(false);
    router.push('/help');
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    logout();
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: dockMode ? 'inline-flex' : 'block', width: dockMode ? 'auto' : '100%' }}>
      {/* Trigger Button */}
      {isCollapsed || dockMode ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={`${user.username} (${roleBadge})`}
          aria-label={t('nav.user_menu')}
          aria-expanded={isOpen}
          style={{
            background: isOpen ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            transition: 'all 0.2s ease',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--color-ocean, #1B8FA6)',
              border: '1.5px solid rgba(246, 240, 225, 0.4)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: isOpen ? '0 0 0 2px rgba(255, 255, 255, 0.6)' : 'none',
              transition: 'all 0.2s ease',
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={t('nav.user_menu')}
          aria-expanded={isOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 10px',
            background: isOpen ? 'var(--color-surface-hover, rgba(15, 76, 92, 0.08))' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
            textAlign: 'left',
          }}
          onMouseOver={(e) => {
            if (!isOpen) e.currentTarget.style.background = 'var(--color-surface-hover, rgba(15, 76, 92, 0.05))';
          }}
          onMouseOut={(e) => {
            if (!isOpen) e.currentTarget.style.background = 'transparent';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
            {/* Avatar circle */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--color-ocean, #1B8FA6)',
                border: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                initial
              )}
            </div>

            {/* Username & optional Admin Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
              <span
                className="font-display"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary, #1A2B32)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.username}
              </span>
              {isAdmin && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '9px',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: 'var(--color-accent-gold-soft, rgba(226, 179, 60, 0.15))',
                    color: 'var(--color-accent-warning, #B8860B)',
                    border: '1px solid var(--color-accent-warning-border, rgba(226, 179, 60, 0.35))',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                  }}
                >
                  {t('nav.admin_badge')}
                </span>
              )}
            </div>
          </div>

          {/* Chevron */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted, #566B76)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Popover Dropdown Card */}
      {menuMount.shouldRender && (
        <div
          role="menu"
          className="paladio-popover"
          data-state={menuMount.dataState}
          data-origin={popoverOrigin}
          aria-label={t('nav.user_navigation')}
          style={{
            position: 'absolute',
            top: placement === 'bottom' ? 'calc(100% + 8px)' : 'auto',
            bottom: placement === 'bottom' ? 'auto' : (dockMode ? 'calc(100% + 14px)' : (isCollapsed ? '0' : 'calc(100% + 8px)')),
            left: placement === 'bottom' ? 'auto' : (dockMode ? 'auto' : (isCollapsed ? 'calc(100% + 10px)' : '0')),
            right: placement === 'bottom' ? '0' : (dockMode ? '0' : 'auto'),
            width: dockMode ? '240px' : (isCollapsed ? '210px' : (placement === 'bottom' ? '240px' : '100%')),
            minWidth: '200px',
            background: 'var(--color-surface-card)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
            padding: '12px 14px 10px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Header: User avatar, User name, Admin Badge, Email */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'var(--color-accent-primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 700,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                initial
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span
                  className="font-display"
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.username}
                </span>
                {isAdmin && (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '9px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: 'var(--color-accent-primary)',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      flexShrink: 0,
                    }}
                  >
                    {t('nav.admin_badge')}
                  </span>
                )}
              </div>
              <div
                className="font-sans"
                style={{
                  fontSize: '12px',
                  color: user.email ? 'var(--color-link)' : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email || t('nav.no_email_configured')}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--color-border)', margin: '2px -14px 4px -14px' }} />

          {/* Menu Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {/* Settings */}
            <button
              onClick={handleSettingsClick}
              role="menuitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '7px 8px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(15, 76, 92, 0.08)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>{t('nav.config')}</span>
            </button>

            {/* Help */}
            <button
              onClick={handleHelpClick}
              role="menuitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '7px 8px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(15, 76, 92, 0.08)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>{t('nav.help')}</span>
            </button>

            {/* Log out */}
            <button
              onClick={handleLogoutClick}
              role="menuitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '7px 8px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(179, 38, 30, 0.08)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>{t('nav.logout')}</span>
            </button>
          </div>

          {/* Footer Pill */}
          <div
            style={{
              marginTop: '6px',
              paddingTop: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <a
              href="https://github.com/Leandro-Juan/paladio"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('nav.github_repository')}
              title={t('nav.github_repository')}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '9999px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                padding: '3px 12px',
                borderRadius: '9999px',
                fontSize: '11px',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>paladio</span>
              <span style={{ color: 'var(--color-text-muted)' }}>v3.0.0</span> {/* x-release-please-version */}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
