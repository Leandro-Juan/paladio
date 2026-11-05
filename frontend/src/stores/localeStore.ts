import { create } from 'zustand';
import { DEFAULT_LOCALE, getLocaleInfo, isRTL } from '@/utils/locales';

export type TranslationDictionary = Record<string, unknown>;

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
    const attr = document.documentElement.getAttribute('lang');
    if (attr) return attr;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    // Check navigator.language
    const browserLang = window.navigator.language;
    if (browserLang) {
      return browserLang;
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  currentLocale: getInitialLocale(),
  direction: isRTL(getInitialLocale()) ? 'rtl' : 'ltr',
  isLoading: false,
  dictionaries: {},

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
