import type { Metadata } from 'next';
import { Jost, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { AuthGuard } from '@/components/AuthGuard';
import { SocketProvider } from '@/contexts/SocketContext';
import { ToastContainer } from '@/components/ToastContainer';
import { TripGenerationOverlay } from '@/components/TripGenerationOverlay';
import { PaladioTooltipProvider } from '@/components/common/PaladioTooltipProvider';
import { PwaRegistration } from '@/components/PwaRegistration';

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

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paladio Control Center',
  description: 'Continuous Sovereign Travel Optimization Engine',
  icons: {
    icon: '/logo-white.png',
  },
};

function getRuntimeConfigScript(): string {
  const rawPort = process.env.API_PORT?.trim() ?? '';
  const apiPort = /^\d{1,5}$/.test(rawPort) ? rawPort : undefined;

  const rawPublicUrl = process.env.PALADIO_PUBLIC_API_URL?.trim() ?? '';
  const apiUrl = /^https?:\/\//i.test(rawPublicUrl) ? rawPublicUrl.replace(/\/+$/, '') : undefined;

  const payload = JSON.stringify({
    ...(apiPort ? { apiPort } : {}),
    ...(apiUrl ? { apiUrl } : {}),
  }).replace(/</g, '\\u003c');

  return `window.__PALADIO_RUNTIME_CONFIG__=${payload};`;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeConfigScript = getRuntimeConfigScript();
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning data-typography="inter" className={`${jost.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `${runtimeConfigScript}(function(){try{var validThemes=['light','dark','silent-waters'];var storedTheme=localStorage.getItem('paladio-theme');var theme=(storedTheme&&validThemes.indexOf(storedTheme)!==-1)?storedTheme:'light';document.documentElement.setAttribute('data-theme',theme);var storedTypo=localStorage.getItem('paladio-typography');var typo=(storedTypo==='classic')?'classic':'inter';document.documentElement.setAttribute('data-typography',typo);var storedNav=localStorage.getItem('paladio-nav-style');var navStyle=(storedNav==='dock')?'dock':'sidebar';document.documentElement.setAttribute('data-nav-style',navStyle);var storedLocale=localStorage.getItem('paladio-locale')||'en';var rtlLangs=['ar','he','fa','ur','yi','ps','ug','sd'];var isRtl=rtlLangs.indexOf(storedLocale.split('-')[0].toLowerCase())!==-1;document.documentElement.setAttribute('lang',storedLocale);document.documentElement.setAttribute('dir',isRtl?'rtl':'ltr');}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-typography','inter');document.documentElement.setAttribute('data-nav-style','sidebar');document.documentElement.setAttribute('lang','en');document.documentElement.setAttribute('dir','ltr');}})();`,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <I18nProvider>
            <SocketProvider>
              <AuthGuard>
                {children}
              </AuthGuard>
              <TripGenerationOverlay />
              <ToastContainer />
              <PaladioTooltipProvider />
              <PwaRegistration />
            </SocketProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

