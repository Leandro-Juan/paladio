import { create } from 'zustand';
import { NotificationItem, NotificationType, ToastItem } from '@/types/notification';

const MAX_NOTIFICATIONS = 100;
const DEFAULT_TOAST_DURATION_MS = 5000;

interface AddNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  actionLink?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

interface NotificationStore {
  currentUserId: string | null;
  notifications: NotificationItem[];
  toasts: ToastItem[];
  unreadCount: number;

  initUser: (userId: string | null) => void;
  addNotification: (params: AddNotificationParams) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  dismissToast: (toastId: string) => void;
}

function getStorageKey(userId: string | null): string {
  return `paladio_notifications_${userId || 'guest'}`;
}

const inMemoryFallback: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return inMemoryFallback[key] ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(key, value);
      return;
    }
  } catch {
    // ignore
  }
  inMemoryFallback[key] = value;
}

function loadFromStorage(userId: string | null): NotificationItem[] {
  try {
    const raw = getStorageItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load notifications from storage:', err);
  }
  return [];
}

function saveToStorage(userId: string | null, items: NotificationItem[]) {
  try {
    setStorageItem(getStorageKey(userId), JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save notifications to storage:', err);
  }
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  currentUserId: null,
  notifications: [],
  toasts: [],
  unreadCount: 0,

  initUser: (userId: string | null) => {
    const items = loadFromStorage(userId);
    const unread = items.filter((n) => !n.read).length;
    set({
      currentUserId: userId,
      notifications: items,
      unreadCount: unread,
    });
  },

  addNotification: (params: AddNotificationParams) => {
    const state = get();
    const userId = state.currentUserId || 'guest';
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const newItem: NotificationItem = {
      id,
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      timestamp,
      read: false,
      actionLink: params.actionLink,
      actionLabel: params.actionLabel,
      metadata: params.metadata,
    };

    const newNotifications = [newItem, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
    saveToStorage(state.currentUserId, newNotifications);

    const toastItem: ToastItem = {
      id: `toast_${id}`,
      notification: newItem,
      durationMs: params.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    };

    set({
      notifications: newNotifications,
      toasts: [...state.toasts, toastItem],
      unreadCount: newNotifications.filter((n) => !n.read).length,
    });

    return newItem;
  },

  markAsRead: (id: string) => {
    const state = get();
    const updated = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    saveToStorage(state.currentUserId, updated);
    set({
      notifications: updated,
      unreadCount: updated.filter((n) => !n.read).length,
    });
  },

  markAllAsRead: () => {
    const state = get();
    const updated = state.notifications.map((n) => ({ ...n, read: true }));
    saveToStorage(state.currentUserId, updated);
    set({
      notifications: updated,
      unreadCount: 0,
    });
  },

  removeNotification: (id: string) => {
    const state = get();
    const updated = state.notifications.filter((n) => n.id !== id);
    saveToStorage(state.currentUserId, updated);
    set({
      notifications: updated,
      unreadCount: updated.filter((n) => !n.read).length,
    });
  },

  clearAll: () => {
    const state = get();
    saveToStorage(state.currentUserId, []);
    set({
      notifications: [],
      unreadCount: 0,
    });
  },

  dismissToast: (toastId: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== toastId),
    }));
  },
}));
