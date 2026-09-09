import type { Metadata } from 'next';
import './globals.css';

import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
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
        <AuthProvider>
          <SocketProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
