"use client";

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarStore } from '@/stores/sidebarStore';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import styles from './AppSidebar.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen } = useSidebarStore();

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

  const handleNavigate = (href: string) => {
    setMobileOpen(false);
    router.push(href);
  };

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Control Center',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      href: '/trips',
      label: 'Upcoming Trips',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      href: '/monitoring',
      label: 'Route Monitor',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
          <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
        </svg>
      ),
    },
    {
      href: '/vault',
      label: 'Itinerary Vault',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Floating Toggle Button when Collapsed */}
      {isCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className={styles.floatingToggle}
          title="Expand navigation (Ctrl+B)"
          aria-label="Expand sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className={styles.mobileBackdrop}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <nav
        className={`${styles.sidebarContainer} sidebar ${isCollapsed ? styles.collapsed : ''} ${isMobileOpen ? `${styles.mobileOpen} mobile-open` : ''}`}
        aria-label="Main Navigation"
      >
        <div className={styles.sidebarInner}>
          {/* Header */}
          <div className={styles.header}>
            <button
              type="button"
              onClick={() => handleNavigate('/dashboard')}
              className={styles.brand}
              title="Paladio Control Center"
            >
              <div className="logo-mark" aria-hidden="true" style={{ width: '30px', height: '30px' }}>
                <div className="logo-icon-sun" style={{ width: '28px', height: '28px' }} />
              </div>
              <span className={styles.brandTitle}>Paladio</span>
            </button>

            <div className={styles.headerActions}>
              <NotificationBell placement="bottom" />
              <button
                type="button"
                onClick={toggleSidebar}
                className={styles.closeButton}
                title="Collapse sidebar (Ctrl+B)"
                aria-label="Collapse sidebar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation Items */}
          <ul className={styles.navList}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    role="link"
                    onClick={() => handleNavigate(item.href)}
                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemIcon}>{item.icon}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer with User Menu */}
          <div className={styles.footer}>
            {user && <UserMenu isCollapsed={false} />}
          </div>
        </div>
      </nav>
    </>
  );
}
