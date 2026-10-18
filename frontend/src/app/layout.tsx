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
  weight: ['300', '400', '500', '600', '700'],
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
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-typography="inter" className={`${jost.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var storedTheme=localStorage.getItem('paladio-theme');var theme=storedTheme||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',theme);var storedTypo=localStorage.getItem('paladio-typography');var typo=(storedTypo==='classic')?'classic':'inter';document.documentElement.setAttribute('data-typography',typo);var storedNav=localStorage.getItem('paladio-nav-style');var navStyle=(storedNav==='dock')?'dock':'sidebar';document.documentElement.setAttribute('data-nav-style',navStyle);}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-typography','inter');document.documentElement.setAttribute('data-nav-style','sidebar');}})();`,
          }}
        />
      </head>
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

