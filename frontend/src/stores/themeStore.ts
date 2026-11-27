import { create } from 'zustand';
import { withViewTransition } from '@/utils/viewTransition';

export type Theme = 'light' | 'dark' | 'silent-waters';

export const VALID_THEMES: readonly Theme[] = ['light', 'dark', 'silent-waters'] as const;

export interface ThemeMeta {
  id: Theme;
  label: string;
  category: 'operational' | 'curated';
  description: string;
  swatches: string[];
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'light',
    label: 'Pacific Jazz Light',
    category: 'operational',
    description: 'Daytime operational palette: warm cream and paper background, deep sea sidebar, and sun coral accents.',
    swatches: ['#F6F0E1', '#FFFBF0', '#0F4C5C', '#D42A2F', '#E2B33C'],
  },
  {
    id: 'dark',
    label: 'Pacific Jazz Dark',
    category: 'operational',
    description: 'Nighttime deep ocean palette: low-glare dark abyss, sky teal highlights, and gold markers.',
    swatches: ['#08222B', '#0F333F', '#061B22', '#7CC4D1', '#E2B33C'],
  },
  {
    id: 'silent-waters',
    label: 'Silent Waters',
    category: 'curated',
    description: 'Dewy blues and weathered gray merge into a hushed palette, like drifting fog on silent waters.',
    swatches: ['#E0FBFC', '#C2DFE3', '#9DB4C0', '#5C6B73', '#253237'],
  },
];

export const THEME_TOGGLE_ENABLED = true;

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'paladio-theme';

function isValidTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (VALID_THEMES as readonly string[]).includes(value);
}

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  // Read from data-theme set by the blocking head script
  const attr = document.documentElement.getAttribute('data-theme');
  if (isValidTheme(attr)) return attr;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isValidTheme(stored)) return stored;
    } catch {
      // ignore
    }
  }
  return 'light';
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // ignore
    }
    withViewTransition(() => {
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme);
        }
      } catch {
        // ignore
      }
      set({ theme });
    });
  },
  toggleTheme: () =>
    set((state) => {
      const currentIndex = VALID_THEMES.indexOf(state.theme);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % VALID_THEMES.length : 0;
      const next: Theme = VALID_THEMES[nextIndex];
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
            document.documentElement.setAttribute('data-theme', next);
          }
        } catch {
          // ignore
        }
      });
      return { theme: next };
    }),
}));
