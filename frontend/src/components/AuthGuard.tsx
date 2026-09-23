"use client";

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, setupRequired, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (setupRequired === true) {
      if (pathname !== '/setup') {
        router.replace('/setup');
      }
    } else if (setupRequired === false) {
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
          style={{ height: '44px', width: 'auto', display: 'block' }}
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

  // If not logged in and not yet redirected, block rendering protected content
  if (!user) {
    return null;
  }

  return (
    <div className="layout-container">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
