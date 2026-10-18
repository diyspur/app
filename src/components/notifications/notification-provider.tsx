'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { markNotificationsReadAction } from '@/features/notifications/actions';
import type { NotificationItemRecord } from '@/features/notifications/presentation';
import { createBrowserSupabase } from '@/lib/supabase/browser';

interface NotificationCursor {
  beforeCreatedAt: string;
  beforeId: string;
}

interface NotificationContextValue {
  items: NotificationItemRecord[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  nextCursor: NotificationCursor | null;
  unreadOnly: boolean;
  setUnreadOnly: (value: boolean) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markOneRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications deve ser usado dentro de NotificationProvider');
  }
  return ctx;
}

interface FeedApiResponse {
  authenticated: boolean;
  userId: string | null;
  unreadCount: number;
  items: NotificationItemRecord[];
  nextCursor: NotificationCursor | null;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItemRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<NotificationCursor | null>(null);
  const [unreadOnly, setUnreadOnlyState] = useState(false);

  const fetchFeed = useCallback(
    async (opts?: { cursor?: NotificationCursor; filterUnread?: boolean; append?: boolean }) => {
      const isAppend = Boolean(opts?.append);
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(false);

      try {
        const params = new URLSearchParams({ limit: '15' });
        if (opts?.filterUnread) {
          params.set('unreadOnly', 'true');
        }
        if (opts?.cursor) {
          params.set('beforeCreatedAt', opts.cursor.beforeCreatedAt);
          params.set('beforeId', opts.cursor.beforeId);
        }

        const res = await fetch(`/api/notifications?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Falha ao buscar notificações');
        }
        const data = (await res.json()) as FeedApiResponse;
        setUserId(data.userId);
        setUnreadCount(data.unreadCount ?? 0);
        setNextCursor(data.nextCursor ?? null);

        if (isAppend) {
          setItems((prev) => {
            const seen = new Set(prev.map((i) => i.id));
            const extra = (data.items ?? []).filter((i) => !seen.has(i.id));
            return [...prev, ...extra];
          });
        } else {
          setItems(data.items ?? []);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchFeed({ filterUnread: unreadOnly, append: false });
  }, [fetchFeed, unreadOnly]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let cleanup: (() => void) | undefined;

    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`user-notifications-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!active) return;
            const row = payload.new as NotificationItemRecord | undefined;
            if (!row?.id) return;
            setItems((prev) => {
              if (prev.some((item) => item.id === row.id)) return prev;
              return [row, ...prev];
            });
            if (row.read_at === null) {
              setUnreadCount((c) => c + 1);
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!active) return;
            const row = payload.new as NotificationItemRecord | undefined;
            if (!row?.id) return;
            setItems((prev) => {
              const prevItem = prev.find((item) => item.id === row.id);
              const wasUnread = prevItem ? prevItem.read_at === null : false;
              const isNowRead = row.read_at !== null;

              if (wasUnread && isNowRead) {
                setUnreadCount((c) => Math.max(0, c - 1));
              } else if (!wasUnread && !isNowRead) {
                setUnreadCount((c) => c + 1);
              }

              return prev.map((item) => (item.id === row.id ? { ...item, read_at: row.read_at } : item));
            });
          },
        )
        .subscribe();

      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime optional fallback
    }

    return () => {
      active = false;
      cleanup?.();
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    await fetchFeed({ filterUnread: unreadOnly, append: false });
  }, [fetchFeed, unreadOnly]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    await fetchFeed({ cursor: nextCursor, filterUnread: unreadOnly, append: true });
  }, [fetchFeed, loadingMore, nextCursor, unreadOnly]);

  const markOneRead = useCallback(async (id: string) => {
    const nowIso = new Date().toISOString();
    let wasUnread = false;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id && item.read_at === null) {
          wasUnread = true;
          return { ...item, read_at: nowIso };
        }
        return item;
      }),
    );
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    const result = await markNotificationsReadAction({ ids: [id] });
    if (!result.ok && wasUnread) {
      await fetchFeed({ filterUnread: unreadOnly, append: false });
    }
  }, [fetchFeed, unreadOnly]);

  const markAllRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (item.read_at === null ? { ...item, read_at: nowIso } : item)),
    );
    setUnreadCount(0);
    const result = await markNotificationsReadAction({ before: nowIso });
    if (!result.ok) {
      await fetchFeed({ filterUnread: unreadOnly, append: false });
    }
  }, [fetchFeed, unreadOnly]);

  const setUnreadOnly = useCallback((value: boolean) => {
    setUnreadOnlyState(value);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unreadCount,
      loading,
      loadingMore,
      error,
      nextCursor,
      unreadOnly,
      setUnreadOnly,
      refresh,
      loadMore,
      markOneRead,
      markAllRead,
    }),
    [
      items,
      unreadCount,
      loading,
      loadingMore,
      error,
      nextCursor,
      unreadOnly,
      setUnreadOnly,
      refresh,
      loadMore,
      markOneRead,
      markAllRead,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
