"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import styles from './FloatingDock.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function FloatingDock() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 500);
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const isVisible = isHovered && !isScrolling;

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: t('nav.dashboard'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      href: '/vault',
      label: t('nav.vault'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      href: '/config',
      label: t('nav.system_config'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
  ];

  const activeHref =
    navItems.find(
      (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    )?.href ?? null;

  const { containerRef, registerItem, indicatorStyle, isReady, animate } =
    useSlidingIndicator<string, HTMLUListElement>(activeHref, [isVisible]);

  return (
    <>
      {/* Bottom hover activation zone & peek affordance */}
      <div
        className={styles.triggerZone}
        onMouseEnter={() => {
          setIsScrolling(false);
          setIsHovered(true);
        }}
        onMouseMove={() => {
          if (isScrolling) setIsScrolling(false);
          if (!isHovered) setIsHovered(true);
        }}
        aria-hidden="true"
      >
        <div
          className={styles.peekBar}
          style={{ opacity: isVisible ? 0 : 0.8 }}
        />
      </div>

      <nav
        className={`${styles.dockContainer} ${isVisible ? '' : styles.hidden}`}
        aria-label={t('nav.main_navigation')}
        onMouseEnter={() => {
          setIsScrolling(false);
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
      >
        <div className={styles.dock}>
          {/* Navigation Items with Dynamic Expansion */}
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
                  <Link
                    ref={registerItem(item.href)}
                    href={item.href}
                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    data-pill-ready={isReady ? 'true' : 'false'}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className={styles.iconWrap}>
                      {item.icon}
                    </div>
                    <span className={styles.label}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className={styles.divider} aria-hidden="true" />

          {/* Right Section: Notification Bell + User Avatar (Photo Only) */}
          <div className={styles.rightSection}>
            <NotificationBell placement="top" />
            {user && <UserMenu dockMode={true} />}
          </div>
        </div>
      </nav>
    </>
  );
}
