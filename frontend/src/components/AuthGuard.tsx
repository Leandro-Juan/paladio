"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { AppSidebar } from './AppSidebar';
import { FloatingDock } from './FloatingDock';
import { NotificationBell } from './NotificationBell';
import { PaladioLoader } from './common/PaladioLoader';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, setupRequired, isLoading, reconnectAttempts } = useAuth();
  const { toggleMobile } = useSidebarStore();
  const { navStyle } = useNavigationStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (setupRequired === true) {
      if (pathname !== '/setup') {
        router.replace('/setup');
      }
    } else {
      if (!user) {
        if (pathname !== '/login') {
          router.replace('/login');
        }
      } else {
        if (pathname === '/login' || pathname === '/setup') {
          router.replace('/dashboard');
        }
      }
    }
  }, [user, setupRequired, isLoading, pathname, router]);

  if (isLoading) {
    let reconnectMessage: React.ReactNode = null;
    if (reconnectAttempts >= 3) {
      reconnectMessage = (
        <div style={{ textAlign: 'center', maxWidth: '340px' }}>
          <p className="font-mono text-xs" style={{ opacity: 0.7, letterSpacing: '0.08em', margin: 0 }}>
            {'// CONNECTING TO PALADIO CORE...'}
          </p>
          {reconnectAttempts >= 10 && (
            <p className="font-mono text-xs" style={{ opacity: 0.5, fontSize: '11px', marginTop: '6px' }}>
              Engine startup is taking longer than usual. Waiting for container initialization.
            </p>
          )}
        </div>
      );
    }
    return <PaladioLoader variant="fullscreen" message={reconnectMessage} />;
  }

  // Auth pages (login, setup) do not render the main app sidebar
  if (pathname === '/login' || pathname === '/setup') {
    return (
      <div className="auth-layout" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-card)' }}>
        {children}
      </div>
    );
  }

  // If not logged in and not yet redirected, render transition state instead of blank void
  if (!user) {
    return <PaladioLoader variant="fullscreen" />;
  }

  // Standalone pages (workspace /trips/[id], vault recap /vault/[id], help center /help, and config /config) do not render the main app sidebar or global navigation
  const isStandalonePage = Boolean(pathname && (/^\/(trips|vault)\/[^\/]+/.test(pathname) || pathname.startsWith('/help') || pathname.startsWith('/config')));
  if (isStandalonePage) {
    return (
      <main className="trip-details-layout" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        {children}
      </main>
    );
  }

  return (
    <div className="layout-container">
      {/* Mobile Top App Bar (visible on <= 768px via CSS) */}
      <header className="mobile-app-header" aria-label="Mobile Navigation Bar">
        <button
          type="button"
          onClick={() => toggleMobile()}
          className="mobile-menu-btn"
          aria-label="Open navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Link href="/dashboard" style={{ textDecoration: 'none' }} aria-label="Paladio Dashboard">
          <div className="logo-container">
            <div className="logo-mark" aria-hidden="true" style={{ width: '30px', height: '30px' }}>
              <div className="logo-icon-sun" style={{ width: '28px', height: '28px' }} />
            </div>
            <span className="logo-text" style={{ fontSize: '16px' }}>PALADIO</span>
          </div>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NotificationBell />
        </div>
      </header>

      {navStyle === 'dock' ? <FloatingDock /> : <AppSidebar />}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
