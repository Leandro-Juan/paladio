export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  scriptFamily: string;
  isShipped?: boolean;
}

/**
 * 10 High-Fluency Core Shipped Languages
 */
export const SHIPPED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', scriptFamily: 'CJK', isShipped: true },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', direction: 'ltr', scriptFamily: 'CJK', isShipped: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', scriptFamily: 'Hangul', isShipped: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', scriptFamily: 'Arabic', isShipped: true },
];

/**
 * Core Shipped Locale Registry (all locales with complete dictionaries in /locales/{code}.json).
 */
export const ALL_LOCALES: LocaleInfo[] = [...SHIPPED_LOCALES];

export const DEFAULT_LOCALE = 'en';

export function getLocaleInfo(code: string): LocaleInfo {
  const normalized = (code || DEFAULT_LOCALE).trim();
  const match = ALL_LOCALES.find((l) => l.code.toLowerCase() === normalized.toLowerCase());
  if (match) return match;
  const prefix = normalized.split('-')[0].toLowerCase();
  const prefixMatch = ALL_LOCALES.find((l) => l.code.toLowerCase() === prefix);
  return prefixMatch || SHIPPED_LOCALES[0];
}

export function isRTL(code: string): boolean {
  return getLocaleInfo(code).direction === 'rtl';
}
