import { test, expect } from '@playwright/test';
import { formatFullDateTime, formatRelativeTime } from '../../src/utils/date';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { notify } from '../../src/utils/notify';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Notification Date Formatting', () => {
  test('formatFullDateTime correctly formats valid ISO strings', () => {
    const iso = '2026-09-16T15:30:00.000Z';
    const formatted = formatFullDateTime(iso);
    expect(formatted).toContain('2026');
    expect(formatted).toContain('Sep');
  });

  test('formatRelativeTime returns accurate relative time strings', () => {
    const nowIso = new Date().toISOString();
    expect(formatRelativeTime(nowIso)).toBe('just now');

    const fiveMinsAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinsAgoIso)).toBe('5m ago');

    const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgoIso)).toBe('2h ago');
  });
});

test.describe('Notification Store & User Isolation', () => {
  test.beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  test('adds notifications and manages unread count', () => {
    const item = notify.success('Solver Finished', 'Itinerary is ready');
    expect(item.title).toBe('Solver Finished');
    expect(item.type).toBe('success');
    expect(item.read).toBe(false);

    const store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(1);
    expect(store.unreadCount).toBe(1);

    // Mark as read
    store.markAsRead(item.id);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  test('supports all notification types: info, warning, error, success', () => {
    notify.info('Info alert', 'Info message');
    notify.warning('Warning alert', 'Warning message');
    notify.error('Error alert', 'Error message');
    notify.success('Success alert', 'Success message');

    const store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(4);
    expect(store.unreadCount).toBe(4);

    store.markAllAsRead();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  test('deletes and clears notifications', () => {
    const notif1 = notify.info('One', 'First');
    notify.info('Two', 'Second');

    let store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(2);

    store.removeNotification(notif1.id);
    store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(1);
    expect(store.notifications[0].title).toBe('Two');

    store.clearAll();
    expect(useNotificationStore.getState().notifications.length).toBe(0);
  });

  test('isolates notifications per user account', () => {
    // User A session
    useNotificationStore.getState().initUser('user_alpha');
    notify.info('Alpha Notification', 'Secret alpha data');

    let store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(1);
    expect(store.notifications[0].title).toBe('Alpha Notification');

    // Switch to User B session
    useNotificationStore.getState().initUser('user_beta');
    store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(0);

    notify.info('Beta Notification', 'Secret beta data');
    store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(1);
    expect(store.notifications[0].title).toBe('Beta Notification');

    // Switch back to User A
    useNotificationStore.getState().initUser('user_alpha');
    store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(1);
    expect(store.notifications[0].title).toBe('Alpha Notification');
  });

  test('caps storage at 100 items (FIFO eviction)', () => {
    useNotificationStore.getState().initUser('user_cap_test');
    for (let i = 0; i < 110; i++) {
      notify.info(`Message ${i}`, `Content ${i}`);
    }

    const store = useNotificationStore.getState();
    expect(store.notifications.length).toBe(100);
    expect(store.notifications[0].title).toBe('Message 109');
    expect(store.notifications[99].title).toBe('Message 10');
  });
});

test.describe('Notification UI in Browser', () => {
  test('renders bell, badge, and toggles notification center on click', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const testTime = new Date('2026-09-16T15:00:00Z').toISOString();
    await page.addInitScript((time) => {
      const mockNotifications = [
        {
          id: 'notif_1',
          userId: 'mock-user-123',
          type: 'success',
          title: 'Route Generated',
          message: 'Itinerary is ready for review.',
          timestamp: time,
          read: false,
          actionLink: '/vault',
          actionLabel: 'View Trip',
        },
      ];
      localStorage.setItem('paladio_notifications_mock-user-123', JSON.stringify(mockNotifications));
    }, testTime);

    await page.goto('/dashboard');

    // Find the notification bell button
    const bell = page.getByRole('button', { name: /Notifications/i });
    await expect(bell).toBeVisible();

    // Verify badge shows '1' unread notification
    await expect(bell).toContainText('1');

    // Click bell to open NotificationCenter
    await bell.click();

    // Notification center should now be visible
    const dialog = page.getByRole('dialog', { name: /Notifications/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Route Generated');
    await expect(dialog).toContainText('Itinerary is ready for review.');
    await expect(dialog).toContainText('2026'); // Formatted date and time
    await expect(dialog).toContainText('View Trip');

    // Click "Read all"
    const readAllBtn = page.getByRole('button', { name: /Read all/i });
    await readAllBtn.click();

    // Badge should disappear
    await expect(bell).not.toContainText('1');
  });
});
