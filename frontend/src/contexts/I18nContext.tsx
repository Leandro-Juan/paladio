"use client";

import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { useLocaleStore } from '@/stores/localeStore';
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

function resolveKey(dict: Record<string, unknown> | undefined, path: string): string | undefined {
  if (!dict) return undefined;
  const parts = path.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, paramName) => {
    return paramName in params ? String(params[paramName]) : match;
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { currentLocale, direction, isLoading, dictionaries, setLocale, loadDictionary } = useLocaleStore();

  // Ensure current locale & default locale (for fallback) are loaded on mount
  useEffect(() => {
    loadDictionary(DEFAULT_LOCALE);
    if (currentLocale !== DEFAULT_LOCALE) {
      loadDictionary(currentLocale);
    }
  }, [currentLocale, loadDictionary]);

  const activeDict = dictionaries[currentLocale];
  const defaultDict = dictionaries[DEFAULT_LOCALE];

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // 1. Try active locale
      let text = resolveKey(activeDict, key);
      // 2. Fall back to default (English) if missing
      if (!text && defaultDict) {
        text = resolveKey(defaultDict, key);
      }
      // 3. Fall back to the key itself if still not found
      if (!text) {
        return key;
      }
      return interpolate(text, params);
    },
    [activeDict, defaultDict]
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
