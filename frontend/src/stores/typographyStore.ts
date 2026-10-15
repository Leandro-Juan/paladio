import { create } from 'zustand';

export type TypographyMode = 'inter' | 'classic';

interface TypographyStore {
  typography: TypographyMode;
  setTypography: (typography: TypographyMode) => void;
  toggleTypography: () => void;
}

const STORAGE_KEY = 'paladio-typography';

function getInitialTypography(): TypographyMode {
  if (typeof document === 'undefined') return 'inter';
  const attr = document.documentElement.getAttribute('data-typography') as TypographyMode | null;
  if (attr === 'inter' || attr === 'classic') return attr;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as TypographyMode | null;
      if (stored === 'inter' || stored === 'classic') return stored;
    } catch {
      // ignore
    }
  }
  return 'inter';
}

export const useTypographyStore = create<TypographyStore>((set) => ({
  typography: getInitialTypography(),
  setTypography: (typography: TypographyMode) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, typography);
        document.documentElement.setAttribute('data-typography', typography);
      }
    } catch {
      // ignore
    }
    set({ typography });
  },
  toggleTypography: () =>
    set((state) => {
      const next: TypographyMode = state.typography === 'inter' ? 'classic' : 'inter';
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
          document.documentElement.setAttribute('data-typography', next);
        }
      } catch {
        // ignore
      }
      return { typography: next };
    }),
}));
