"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from './NotificationBell';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Control Center' },
    { href: '/engine', label: 'Active Engine' },
    { href: '/trips', label: 'Upcoming Trips' },
    { href: '/vault', label: 'Itinerary Vault' },
    { href: '/model', label: 'Preference Model' },
    { href: '/config', label: 'Configuration', badge: user?.role === 'admin' ? 'ADMIN' : undefined },
  ];

  return (
    <nav className="sidebar">
      <div className="brand" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <img
              src="/logo.jpeg"
              alt="Paladio Logo"
              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }}
            />
            <h1 className="font-display text-accent" style={{ margin: 0 }}>PALADIO</h1>
          </div>
          <p className="font-mono text-muted" style={{ fontSize: '10px', margin: 0 }}>{'// v1.0.0 ENGINE'}</p>
        </div>
        <NotificationBell />
      </div>

      <ul className="nav-links font-display" style={{ flex: 1 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                style={{
                  color: isActive ? 'var(--color-accent-primary)' : undefined,
                  fontWeight: isActive ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{item.label}</span>
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
            </li>
          );
        })}
      </ul>

      {user && (
        <div
          className="sidebar-footer border-subtle"
          style={{
            padding: '12px',
            borderRadius: '8px',
            background: 'var(--color-bg-main)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ overflow: 'hidden' }}>
              <div
                className="font-display"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.username}
              </div>
              <div
                className="font-mono text-muted"
                style={{
                  fontSize: '10px',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email}
              </div>
            </div>
            <span
              className="font-mono"
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '3px',
                background: user.role === 'admin' ? '#1E3A8A' : '#64748B',
                color: '#FFFFFF',
                fontWeight: 600,
              }}
            >
              {user.role.toUpperCase()}
            </span>
          </div>

          <button
            onClick={logout}
            className="font-mono"
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '11px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#DC2626';
              e.currentTarget.style.color = '#DC2626';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            {'[ DISCONNECT / SIGN OUT ]'}
          </button>
        </div>
      )}
    </nav>
  );
}
