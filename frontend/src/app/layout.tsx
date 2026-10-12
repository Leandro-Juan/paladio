import type { Metadata } from 'next';
import { Jost, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { SocketProvider } from '@/contexts/SocketContext';
import { ToastContainer } from '@/components/ToastContainer';

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '500', '600'],
  display: 'swap',
  variable: '--font-jost',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Paladio Control Center',
  description: 'Continuous Sovereign Travel Optimization Engine',
  icons: {
    icon: '/logo-white.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jost.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>
          <SocketProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
            <ToastContainer />
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

