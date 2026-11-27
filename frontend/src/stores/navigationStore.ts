import { create } from 'zustand';
import { withViewTransition } from '@/utils/viewTransition';

export type NavigationStyle = 'sidebar' | 'dock';

interface NavigationStore {
  navStyle: NavigationStyle;
  setNavStyle: (style: NavigationStyle) => void;
  toggleNavStyle: () => void;
}

const STORAGE_KEY = 'paladio-nav-style';

function getInitialNavStyle(): NavigationStyle {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-nav-style') as NavigationStyle | null;
    if (attr === 'sidebar' || attr === 'dock') return attr;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as NavigationStyle | null;
      if (stored === 'sidebar' || stored === 'dock') return stored;
    } catch {
      // ignore
    }
  }
  return 'sidebar';
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  navStyle: getInitialNavStyle(),
  setNavStyle: (style: NavigationStyle) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, style);
      }
    } catch {
      // ignore
    }
    withViewTransition(() => {
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-nav-style', style);
        }
      } catch {
        // ignore
      }
      set({ navStyle: style });
    });
  },
  toggleNavStyle: () =>
    set((state) => {
      const next: NavigationStyle = state.navStyle === 'sidebar' ? 'dock' : 'sidebar';
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        // ignore
      }
      withViewTransition(() => {
        try {
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-nav-style', next);
          }
        } catch {
          // ignore
        }
      });
      return { navStyle: next };
    }),
}));
