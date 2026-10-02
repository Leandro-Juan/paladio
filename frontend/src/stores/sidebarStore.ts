import { create } from 'zustand';

interface SidebarStore {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const STORAGE_KEY = 'paladio_sidebar_collapsed';

function getInitialState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'true';
  } catch {
    return false;
  }
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: getInitialState(),
  toggleSidebar: () =>
    set((state) => {
      const next = !state.isCollapsed;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        }
      } catch {
        // ignore
      }
      return { isCollapsed: next };
    }),
  setCollapsed: (collapsed: boolean) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(collapsed));
      }
    } catch {
      // ignore
    }
    set({ isCollapsed: collapsed });
  },
}));
