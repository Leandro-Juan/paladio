import { create } from 'zustand';
import { DEFAULT_LOCALE, getLocaleInfo, isRTL } from '@/utils/locales';
import enDict from '../../public/locales/en.json';

export type TranslationDictionary = Record<string, unknown>;

export function resolveKey(dict: TranslationDictionary | undefined, path: string): string | undefined {
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

export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, paramName) => {
    return paramName in params ? String(params[paramName]) : match;
  });
}

export function buildEnglishToKeyMap(
  dict: TranslationDictionary,
  prefix: string = '',
  map: Map<string, string> = new Map()
): Map<string, string> {
  for (const [k, v] of Object.entries(dict)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      if (!map.has(v)) {
        map.set(v, fullKey);
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      buildEnglishToKeyMap(v as TranslationDictionary, fullKey, map);
    }
  }
  return map;
}

const DEFAULT_DICTIONARY = enDict as TranslationDictionary;
const DEFAULT_ENGLISH_TO_KEY_MAP = buildEnglishToKeyMap(DEFAULT_DICTIONARY);

export function translateFromDictionaries(
  dictionaries: Record<string, TranslationDictionary>,
  locale: string,
  key: string,
  params?: Record<string, string | number>,
  englishMap: Map<string, string> = DEFAULT_ENGLISH_TO_KEY_MAP
): string {
  if (!key) return '';
  const activeDict = dictionaries[locale];
  const defaultDict = dictionaries[DEFAULT_LOCALE] ?? DEFAULT_DICTIONARY;

  let text = resolveKey(activeDict, key);
  if (text === undefined) {
    text = resolveKey(defaultDict, key);
  }
  if (text === undefined) {
    const mappedKey = englishMap.get(key);
    if (mappedKey) {
      text = resolveKey(activeDict, mappedKey) ?? resolveKey(defaultDict, mappedKey);
    }
  }
  if (text === undefined) {
    return interpolate(key, params);
  }
  return interpolate(text, params);
}

interface LocaleState {
  currentLocale: string;
  direction: 'ltr' | 'rtl';
  isLoading: boolean;
  dictionaries: Record<string, TranslationDictionary>;
  setLocale: (code: string) => Promise<void>;
  loadDictionary: (code: string) => Promise<TranslationDictionary>;
}

const STORAGE_KEY = 'paladio-locale';

function getInitialLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return getLocaleInfo(stored).code;
    const attr = document.documentElement.getAttribute('lang');
    if (attr) return getLocaleInfo(attr).code;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  currentLocale: getInitialLocale(),
  direction: isRTL(getInitialLocale()) ? 'rtl' : 'ltr',
  isLoading: false,
  dictionaries: {
    [DEFAULT_LOCALE]: DEFAULT_DICTIONARY,
  },

  loadDictionary: async (code: string): Promise<TranslationDictionary> => {
    const cached = get().dictionaries[code];
    if (cached) return cached;

    try {
      const res = await fetch(`/locales/${code}.json`);
      if (!res.ok) {
        // If specific regional locale fails (e.g. pt-BR), try language base (e.g. pt)
        if (code.includes('-')) {
          const base = code.split('-')[0];
          const baseRes = await fetch(`/locales/${base}.json`);
          if (baseRes.ok) {
            const data = await baseRes.json();
            set((state) => ({
              dictionaries: { ...state.dictionaries, [code]: data, [base]: data },
            }));
            return data;
          }
        }
        throw new Error(`Locale dictionary for ${code} not found`);
      }
      const data = await res.json();
      set((state) => ({
        dictionaries: { ...state.dictionaries, [code]: data },
      }));
      return data;
    } catch (err) {
      console.warn(`Failed to load locale '${code}', falling back to '${DEFAULT_LOCALE}':`, err);
      // Fallback to default locale if not already default
      if (code !== DEFAULT_LOCALE) {
        return get().loadDictionary(DEFAULT_LOCALE);
      }
      return {};
    }
  },

  setLocale: async (code: string) => {
    const info = getLocaleInfo(code);
    const targetCode = info.code;
    const dir = info.direction;

    set({ isLoading: true });

    try {
      const dict = await get().loadDictionary(targetCode);

      // Persist in localStorage and cookie
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, targetCode);
          document.cookie = `paladio-locale=${encodeURIComponent(targetCode)}; path=/; max-age=31536000; SameSite=Lax`;
          document.documentElement.setAttribute('lang', targetCode);
          document.documentElement.setAttribute('dir', dir);
        } catch {
          // ignore storage errors
        }
      }

      set({
        currentLocale: targetCode,
        direction: dir,
        isLoading: false,
        dictionaries: {
          ...get().dictionaries,
          [targetCode]: dict,
        },
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));

/**
 * Imperative translation helper for non-React utilities (date formatters, error parsers, etc.).
 */
export function translate(
  key: string,
  params?: Record<string, string | number>,
  localeOverride?: string
): string {
  const state = useLocaleStore.getState();
  const targetLocale = localeOverride ? getLocaleInfo(localeOverride).code : state.currentLocale;
  return translateFromDictionaries(state.dictionaries, targetLocale, key, params);
}

if (typeof window !== 'undefined') {
  (window as unknown as { __PALADIO_LOCALE_STORE__?: typeof useLocaleStore }).__PALADIO_LOCALE_STORE__ = useLocaleStore;
}
