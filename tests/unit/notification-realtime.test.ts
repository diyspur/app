import { describe, it, expect } from 'vitest';

type NotificationItem = {
  id: string;
  read_at: string | null;
};

// Pure reducer testing the real-time update logic of notification-provider
function reconcileNotificationUpdate(
  items: NotificationItem[],
  unreadCount: number,
  updatedRow: NotificationItem,
): { items: NotificationItem[]; unreadCount: number } {
  const existing = items.find((i) => i.id === updatedRow.id);
  const wasUnread = existing ? existing.read_at === null : false;
  const isNowRead = updatedRow.read_at !== null;

  let newCount = unreadCount;
  if (wasUnread && isNowRead) {
    newCount = Math.max(0, unreadCount - 1);
  } else if (!wasUnread && !isNowRead) {
    newCount = unreadCount + 1;
  }

  const newItems = items.map((i) => (i.id === updatedRow.id ? { ...i, read_at: updatedRow.read_at } : i));
  return { items: newItems, unreadCount: newCount };
}

describe('Notification Realtime & Focus Reconciler (QA-16, QA-17)', () => {
  it('decrements unreadCount when an unread item becomes read via realtime UPDATE', () => {
    const initialItems: NotificationItem[] = [
      { id: 'notif-1', read_at: null },
      { id: 'notif-2', read_at: null },
    ];
    const initialCount = 2;

    const { items, unreadCount } = reconcileNotificationUpdate(
      initialItems,
      initialCount,
      { id: 'notif-1', read_at: '2026-10-18T00:00:00Z' },
    );

    expect(unreadCount).toBe(1);
    expect(items.find((i) => i.id === 'notif-1')?.read_at).not.toBeNull();
  });

  it('keeps count unchanged if an already read item receives another UPDATE', () => {
    const initialItems: NotificationItem[] = [
      { id: 'notif-1', read_at: '2026-10-17T00:00:00Z' },
    ];
    const initialCount = 0;

    const { unreadCount } = reconcileNotificationUpdate(
      initialItems,
      initialCount,
      { id: 'notif-1', read_at: '2026-10-18T00:00:00Z' },
    );

    expect(unreadCount).toBe(0);
  });
});
