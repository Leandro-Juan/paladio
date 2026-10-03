"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from './Modal';

interface UserMenuProps {
  isCollapsed: boolean;
}

export function UserMenu({ isCollapsed }: UserMenuProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const initial = (user.username || 'U').charAt(0).toUpperCase();
  const avatarUrl = (user.preferences?.avatar_url || user.preferences?.pfp) as string | undefined;

  const handleSettingsClick = () => {
    setIsOpen(false);
    router.push('/config');
  };

  const handleHelpClick = () => {
    setIsOpen(false);
    setShowHelpModal(true);
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    logout();
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      {isCollapsed ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={`${user.username} (${user.role.toUpperCase()})`}
          aria-label="User menu"
          aria-expanded={isOpen}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              boxShadow: isOpen ? '0 0 0 2px var(--color-accent-primary, #1E3A8A)' : 'none',
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
          aria-label="User menu"
          aria-expanded={isOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            background: isOpen ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
            textAlign: 'left',
          }}
          onMouseOver={(e) => {
            if (!isOpen) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)';
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
                background: '#0F172A',
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
                  color: 'var(--color-text-main, #0F172A)',
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
                    background: '#1E3A8A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                  }}
                >
                  ADMIN
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
            stroke="var(--color-text-muted, #64748B)"
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
      {isOpen && (
        <div
          role="menu"
          aria-label="User navigation"
          style={{
            position: 'absolute',
            bottom: isCollapsed ? '0' : 'calc(100% + 8px)',
            left: isCollapsed ? 'calc(100% + 10px)' : '0',
            width: isCollapsed ? '210px' : '100%',
            minWidth: '200px',
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '12px 14px 10px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Header: User avatar, User name, Admin Badge, Email */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#0F172A',
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
                    color: '#0F172A',
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
                      background: '#1E3A8A',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      flexShrink: 0,
                    }}
                  >
                    ADMIN
                  </span>
                )}
              </div>
              <div
                className="font-sans"
                style={{
                  fontSize: '12px',
                  color: user.email ? '#2563EB' : 'var(--color-text-muted, #94A3B8)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email || 'No email configured'}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: '#F1F5F9', margin: '2px -14px 4px -14px' }} />

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
                color: '#334155',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#334155';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
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
                color: '#334155',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#334155';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>Help</span>
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
                color: '#EF4444',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#FEF2F2';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log out</span>
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
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#F1F5F9',
                padding: '3px 12px',
                borderRadius: '9999px',
                fontSize: '11px',
              }}
            >
              <span style={{ fontWeight: 700, color: '#334155' }}>paladio</span>
              <span style={{ color: '#64748B' }}>v1.2.0</span> {/* x-release-please-version */}
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      <Modal
        isOpen={showHelpModal}
        title="Paladio Sovereign Engine Help"
        message="Paladio is an air-gappable, sovereign travel itinerary optimization engine."
        confirmText="CLOSE"
        onConfirm={() => setShowHelpModal(false)}
        onCancel={() => setShowHelpModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--color-text-main)' }}>
          <div>
            <strong>Keyboard Shortcuts:</strong>
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              <li><code>Ctrl + B</code> / <code>Cmd + B</code>: Toggle sidebar collapse</li>
            </ul>
          </div>
          <div>
            <strong>Instance Management:</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Access administrative settings, GTFS feeds, and telemetry via the <strong>Settings</strong> menu option.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
