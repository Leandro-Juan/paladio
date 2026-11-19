"use client";

import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import {
  buildEnglishToKeyMap,
  translateFromDictionaries,
  useLocaleStore,
} from '@/stores/localeStore';
import { DEFAULT_LOCALE } from '@/utils/locales';

interface I18nContextValue {
  locale: string;
  dir: 'ltr' | 'rtl';
  isLoading: boolean;
  setLocale: (code: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { currentLocale, direction, isLoading, dictionaries, setLocale, loadDictionary } = useLocaleStore();

  // Ensure current locale dictionary is loaded and DOM lang/dir attributes stay synced
  useEffect(() => {
    loadDictionary(DEFAULT_LOCALE);
    if (currentLocale !== DEFAULT_LOCALE) {
      loadDictionary(currentLocale);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', currentLocale);
      document.documentElement.setAttribute('dir', direction);
    }
  }, [currentLocale, direction, loadDictionary]);

  const defaultDict = dictionaries[DEFAULT_LOCALE];
  const englishMap = useMemo(
    () => (defaultDict ? buildEnglishToKeyMap(defaultDict) : undefined),
    [defaultDict]
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return translateFromDictionaries(dictionaries, currentLocale, key, params, englishMap);
    },
    [dictionaries, currentLocale, englishMap]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
      try {
        const d = date instanceof Date ? date : new Date(date);
        return new Intl.DateTimeFormat(currentLocale, options).format(d);
      } catch {
        return String(date);
      }
    },
    [currentLocale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      try {
        return new Intl.NumberFormat(currentLocale, options).format(value);
      } catch {
        return String(value);
      }
    },
    [currentLocale]
  );

  const formatCurrency = useCallback(
    (amount: number, currency: string = 'EUR'): string => {
      try {
        return new Intl.NumberFormat(currentLocale, {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${amount} ${currency}`;
      }
    },
    [currentLocale]
  );

  const value = useMemo(
    () => ({
      locale: currentLocale,
      dir: direction,
      isLoading,
      setLocale,
      t,
      formatDate,
      formatNumber,
      formatCurrency,
    }),
    [currentLocale, direction, isLoading, setLocale, t, formatDate, formatNumber, formatCurrency]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
