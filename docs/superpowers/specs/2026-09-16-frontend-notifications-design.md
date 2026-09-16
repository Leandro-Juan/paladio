# Frontend Notification System Design Specification

## 1. Overview & Goals
This document outlines the architectural design for a client-side notification system in Paladio's Next.js frontend. The system provides:
- **User-Isolated Storage:** Notifications are partitioned per authenticated user (`user.id`) in `localStorage`.
- **Hybrid Triggering:** Automatic capture of engine/WebSocket telemetry events (solver completion, errors, clarification requests) alongside a simple imperative `notify` API for React components and user actions.
- **Rich Timestamps:** Every notification includes an ISO timestamp formatted into readable date & time plus relative time indicators.
- **Interactive UI Surfaces:** A notification bell with unread badge in the sidebar/navigation, a slide-out/dropdown notification center with read/clear controls and actionable links, and transient floating toasts for real-time alerts.

---

## 2. Data Model & Storage Partitioning

### 2.1 Type Definitions (`frontend/src/types/notification.ts`)

```typescript
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO 8601 (e.g., "2026-09-16T17:40:00.000Z")
  read: boolean;
  actionLink?: string; // e.g., "/engine", "/vault"
  actionLabel?: string; // e.g., "View Itinerary"
  metadata?: Record<string, unknown>;
}

export interface ToastItem {
  id: string;
  notification: NotificationItem;
  durationMs: number;
}
```

### 2.2 Storage Isolation Strategy
- **Key Schema:** `paladio_notifications_${userId}`. If no user is logged in, fallback to `paladio_notifications_guest`.
- **User Switching:** When `user` in `AuthContext` changes:
  1. The active storage key is updated.
  2. The store rehydrates with the new user's notification list.
  3. No cross-user data leakage is possible.
- **Quota & Retention Policy:**
  - Maximum 100 notifications per user.
  - Automatically drops the oldest notifications when limit is reached (FIFO).
  - Storage operations are wrapped in `try/catch` to handle private browsing or quota limits gracefully.

---

## 3. Architecture & Store Design

### 3.1 Store: `useNotificationStore` (`frontend/src/stores/notificationStore.ts`)
Built using Zustand (`^5.0.15`):

```typescript
interface NotificationState {
  currentUserId: string | null;
  notifications: NotificationItem[];
  toasts: ToastItem[];
  unreadCount: number;

  // Actions
  initUser: (userId: string | null) => void;
  addNotification: (params: Omit<NotificationItem, 'id' | 'timestamp' | 'read' | 'userId'>) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  dismissToast: (toastId: string) => void;
}
```

### 3.2 Imperative Dispatcher API (`frontend/src/utils/notify.ts`)
A clean helper for components:
```typescript
export const notify = {
  info: (title: string, message: string, options?: Partial<NotificationItem>) => ...,
  success: (title: string, message: string, options?: Partial<NotificationItem>) => ...,
  warning: (title: string, message: string, options?: Partial<NotificationItem>) => ...,
  error: (title: string, message: string, options?: Partial<NotificationItem>) => ...,
};
```

---

## 4. Engine & WebSocket Telemetry Bridge

### 4.1 Bridge Hook: `useSocketNotificationBridge` (`frontend/src/hooks/useSocketNotificationBridge.ts`)
Subscribes to telemetry from `SocketContext` or wraps the socket handler to generate relevant alerts:
- `EVALUATING_ROUTES` (status `completed` / `recovered`): Emits `success` notification: *"Itinerary Generated — Route and transit plan is ready."* with action link to `/engine` or `/vault`.
- `CLARIFICATION_NEEDED`: Emits `warning` notification: *"Input Required — Solver requires additional constraints."* with action link to `/engine`.
- `ERROR`: Emits `error` notification: *"Engine Fault — Inference failed."*
- `FEEDBACK_PROCESSED`: Emits `info` notification: *"Preference Model Updated"*.

Duplicate suppression is built-in so re-renders or socket reconnects do not trigger duplicate notifications.

---

## 5. UI Components & User Experience

### 5.1 Notification Bell & Unread Badge (`NotificationBell.tsx`)
- Placed in `Sidebar.tsx` (or top navigation).
- Shows an indicator badge with unread count (e.g. `3` or `9+`).
- Clicking toggles the Notification Center panel.

### 5.2 Notification Center (`NotificationCenter.tsx`)
- Slide-out drawer or anchored popover dropdown.
- Header displaying total notifications and "Mark all as read" / "Clear all" buttons.
- List displaying:
  - Type icon / badge (Color-coded: blue, green, amber, red).
  - Title and message text.
  - Formatted date & time (e.g., `Sep 16, 17:40`) and relative time (`5m ago`).
  - Action button/link if `actionLink` is present.
  - Delete (trash) icon to dismiss individual item.
  - Read/unread dot toggle.
- Empty state: *"No notifications yet."*

### 5.3 Toast Container & Toast Card (`ToastContainer.tsx`)
- Fixed at the top-right (`z-index: 9999`).
- Displays animated entrance/exit.
- Auto-dismisses after 4 seconds (configurable).
- Includes close `x` button and link button if applicable.

---

## 6. Testing & Verification

1. **Unit Tests:**
   - Store persistence: Verify adding a notification writes to `localStorage` under `paladio_notifications_${userId}`.
   - User switching: Verify switching `userId` loads only that user's notifications.
   - Cap enforcement: Verify exceeding 100 items evicts the oldest.
   - Mark as read, remove, clear all operations.
2. **Component & Integration Tests:**
   - Verify `NotificationBell` updates badge on new notifications.
   - Verify `ToastContainer` displays toast on dispatch and auto-dismisses.
   - Verify `NotificationCenter` shows exact date and time.
