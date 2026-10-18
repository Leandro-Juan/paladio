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

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, setupRequired, isLoading } = useAuth();
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
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-bg-main)',
          gap: '1rem',
        }}
      >
        <img
          src="/logo-horizontal.png"
          alt="Paladio Logo"
          className="brand-logo-light"
          style={{ height: '44px', width: 'auto', display: 'block' }}
        />
        <img
          src="/logo-horizontal-dark.png"
          alt="Paladio Logo"
          className="brand-logo-dark"
          style={{ height: '44px', width: 'auto', display: 'none' }}
        />
        <p className="font-mono text-muted" style={{ fontSize: '12px' }}>
          {'// VERIFYING SOVEREIGN SECURITY GATE...'}
        </p>
      </div>
    );
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
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-bg-main)',
          gap: '1rem',
        }}
      >
        <img
          src="/logo-horizontal.png"
          alt="Paladio Logo"
          className="brand-logo-light"
          style={{ height: '44px', width: 'auto', display: 'block' }}
        />
        <p className="font-mono text-muted" style={{ fontSize: '12px' }}>
          {'// REDIRECTING TO AUTHENTICATION...'}
        </p>
      </div>
    );
  }

  // Trip details pages (/trips/[id]) do not render the main app sidebar or global navigation
  const isTripDetailsPage = Boolean(pathname && /^\/trips\/[^\/]+/.test(pathname));
  if (isTripDetailsPage) {
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
            <div className="logo-mark" aria-hidden="true" style={{ width: '26px', height: '26px' }}>
              <div className="logo-icon-sun" style={{ width: '22px', height: '22px' }} />
              <div className="logo-ring" />
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
