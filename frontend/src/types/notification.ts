export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO 8601 string
  read: boolean;
  actionLink?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface ToastItem {
  id: string;
  notification: NotificationItem;
  durationMs: number;
}
