"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarStore } from '@/stores/sidebarStore';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebarStore();

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Control Center',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      href: '/engine',
      label: 'Active Engine',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      href: '/trips',
      label: 'Upcoming Trips',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      href: '/vault',
      label: 'Itinerary Vault',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
  ];

  return (
    <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} aria-label="Main Navigation">
      {/* Brand header */}
      {isCollapsed ? (
        <div className="brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
          <button
            onClick={toggleSidebar}
            className="sidebar-toggle-btn"
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
            style={{ width: '32px', height: '32px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <Link href="/dashboard" title="Paladio Control Center">
            <img
              src="/logo.png"
              alt="Paladio Icon"
              style={{ height: '28px', width: '28px', objectFit: 'contain', display: 'block' }}
            />
          </Link>
          <NotificationBell />
        </div>
      ) : (
        <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <Link href="/dashboard" title="Paladio Control Center">
              <img
                src="/logo-horizontal.png"
                alt="Paladio Logo"
                style={{ height: '32px', width: 'auto', display: 'block' }}
              />
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <NotificationBell />
            <button
              onClick={toggleSidebar}
              className="sidebar-toggle-btn"
              title="Collapse sidebar (Ctrl+B)"
              aria-label="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Nav links */}
      <ul className="nav-links font-display" style={{ flex: 1, width: '100%' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              {isCollapsed ? (
                <Link
                  href={item.href}
                  className={isActive ? 'active' : ''}
                  title={`${item.label}${item.badge ? ` [${item.badge}]` : ''}`}
                  aria-label={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    width: '40px',
                    height: '40px',
                    margin: '0 auto',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--color-accent-primary)' : 'inherit' }}>
                    {item.icon}
                  </span>
                  {item.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--color-accent-primary)',
                      }}
                    />
                  )}
                </Link>
              ) : (
                <Link
                  href={item.href}
                  className={isActive ? 'active' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--color-accent-primary)' : 'inherit' }}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--color-accent-primary)',
                        color: '#FFF',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* Footer User Menu */}
      {user && (
        <div
          className="sidebar-footer"
          style={{
            marginTop: 'auto',
            width: '100%',
            paddingTop: '10px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <UserMenu isCollapsed={isCollapsed} />
        </div>
      )}
    </nav>
  );
}
