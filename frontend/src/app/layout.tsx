import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

import { SocketProvider } from '@/contexts/SocketContext';

export const metadata: Metadata = {
  title: 'Paladio Control Center',
  description: 'Continuous Sovereign Travel Optimization Engine',
  icons: {
    icon: '/logo.jpeg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SocketProvider>
          <div className="layout-container">
            <nav className="sidebar">
              <div className="brand">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <img src="/logo.jpeg" alt="Paladio Logo" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
                  <h1 className="font-display text-accent" style={{ margin: 0 }}>PALADIO</h1>
                </div>
                <p className="font-mono text-muted" style={{ fontSize: '10px', margin: 0 }}>{'// v1.0.0 ENGINE'}</p>
              </div>
              <ul className="nav-links font-display">
                <li><Link href="/dashboard">Control Center</Link></li>
                <li><Link href="/engine">Active Engine</Link></li>
                <li><Link href="/trips">Upcoming Trips</Link></li>
                <li><Link href="/vault">Itinerary Vault</Link></li>
                <li><Link href="/model">Preference Model</Link></li>
              </ul>
            </nav>
            <main className="main-content">
              {children}
            </main>
          </div>
        </SocketProvider>
      </body>
    </html>
  );
}
