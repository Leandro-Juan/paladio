import { create } from 'zustand';

export type Theme = 'light' | 'dark';

export const THEME_TOGGLE_ENABLED = false;

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'paladio-theme';

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  // Read from data-theme set by the blocking head script
  const attr = document.documentElement.getAttribute('data-theme') as Theme | null;
  if (attr === 'light' || attr === 'dark') return attr;
  return 'light';
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, theme);
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch {
      // ignore
    }
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light';
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
          document.documentElement.setAttribute('data-theme', next);
        }
      } catch {
        // ignore
      }
      return { theme: next };
    }),
}));
