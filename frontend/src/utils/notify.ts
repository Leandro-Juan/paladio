import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationItem, NotificationType } from '@/types/notification';

interface NotifyOptions {
  actionLink?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

function dispatch(type: NotificationType, title: string, message: string, options?: NotifyOptions): NotificationItem {
  return useNotificationStore.getState().addNotification({
    type,
    title,
    message,
    actionLink: options?.actionLink,
    actionLabel: options?.actionLabel,
    metadata: options?.metadata,
    durationMs: options?.durationMs,
  });
}

export const notify = {
  info: (title: string, message: string, options?: NotifyOptions) => dispatch('info', title, message, options),
  success: (title: string, message: string, options?: NotifyOptions) => dispatch('success', title, message, options),
  warning: (title: string, message: string, options?: NotifyOptions) => dispatch('warning', title, message, options),
  error: (title: string, message: string, options?: NotifyOptions) => dispatch('error', title, message, options),
};
