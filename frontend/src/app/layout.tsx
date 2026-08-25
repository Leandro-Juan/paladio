import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Paladio Control Center',
  description: 'Continuous Sovereign Travel Optimization Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout-container">
          <nav className="sidebar">
            <div className="brand">
              <h1 className="font-display text-accent">PALADIO</h1>
              <p className="font-mono text-muted" style={{ fontSize: '10px' }}>// v1.0.0 ENGINE</p>
            </div>
            <ul className="nav-links font-display">
              <li><Link href="/dashboard">Control Center</Link></li>
              <li><Link href="/engine">Active Engine</Link></li>
              <li><Link href="/vault">Itinerary Vault</Link></li>
              <li><Link href="/model">Preference Model</Link></li>
            </ul>
          </nav>
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
