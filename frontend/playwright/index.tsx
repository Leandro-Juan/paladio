import React from 'react';
import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { I18nProvider } from '../src/contexts/I18nContext';
import '../src/app/globals.css';

const mockRouter: any = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};

beforeMount(async ({ App }) => {
  return (
    <AppRouterContext.Provider value={mockRouter}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </AppRouterContext.Provider>
  );
});
