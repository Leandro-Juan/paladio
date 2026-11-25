"use client";

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator';
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
  const { t } = useTranslation();
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
      label: t('nav.dashboard'),
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
      label: t('nav.new_trip'),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      href: '/monitoring',
      label: t('nav.monitoring'),
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
      label: t('nav.vault'),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
  ];

  const activeHref =
    navItems.find(
      (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    )?.href ?? null;

  const { containerRef, registerItem, indicatorStyle, isReady, animate } =
    useSlidingIndicator<string, HTMLUListElement>(activeHref, [isCollapsed, isMobileOpen]);
  const toggleMount = useAnimatedMount(isCollapsed, 130);
  const backdropMount = useAnimatedMount(isMobileOpen, 150);

  return (
    <>
      {/* Floating Toggle Button when Collapsed */}
      {toggleMount.shouldRender && (
        <button
          type="button"
          onClick={toggleSidebar}
          className={`${styles.floatingToggle} paladio-popover`}
          data-origin="top-left"
          data-state={toggleMount.dataState}
          data-tooltip={t('nav.expand_navigation')}
          data-tooltip-shortcut="Ctrl+B"
          data-tooltip-position="right"
          aria-label={t('nav.expand_sidebar')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Mobile Drawer Backdrop */}
      {backdropMount.shouldRender && (
        <div
          className={`${styles.mobileBackdrop} paladio-modal-backdrop`}
          data-state={backdropMount.dataState}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <nav
        className={`${styles.sidebarContainer} sidebar ${isCollapsed ? styles.collapsed : ''} ${isMobileOpen ? `${styles.mobileOpen} mobile-open` : ''}`}
        aria-label={t('nav.main_navigation')}
      >
        <div className={styles.sidebarInner}>
          {/* Header */}
          <div className={styles.header}>
            <button
              type="button"
              onClick={() => handleNavigate('/dashboard')}
              className={styles.brand}
              data-tooltip={t('nav.paladio_control_center')}
              data-tooltip-position="bottom"
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
                data-tooltip={t('nav.collapse_sidebar')}
                data-tooltip-shortcut="Ctrl+B"
                data-tooltip-position="bottom"
                aria-label={t('nav.collapse_sidebar')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation Items */}
          <ul ref={containerRef} className={styles.navList}>
            <li
              aria-hidden="true"
              className={`${styles.activePill} paladio-sliding-pill`}
              data-animate={animate ? 'true' : 'false'}
              style={indicatorStyle}
            />
            {navItems.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <li key={item.href}>
                  <button
                    ref={registerItem(item.href)}
                    type="button"
                    role="link"
                    onClick={() => handleNavigate(item.href)}
                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    data-pill-ready={isReady ? 'true' : 'false'}
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
